import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Mail, Send, ChevronDown, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'

export interface EmailComposerPayload {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  message: string
  copyToSelf: boolean
  attachFiles?: boolean
  /** Guest reply-to / copy-to-self address */
  replyTo?: string
}

interface KitAttachmentOptions {
  items?: { fileSize: number }[]
  primarySizeBytes?: number
  primaryLabel?: string
  primaryDescription?: string
  attachLabel?: string
}

interface EmailComposerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle: string
  defaultSubject: string
  defaultMessage: string
  defaultTo?: string
  /** When true, show reply-to field (guests have no account email). */
  requireReplyTo?: boolean
  kitAttachment?: KitAttachmentOptions
  onSend: (payload: EmailComposerPayload) => Promise<string>
  fromLabel?: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const KIT_ATTACH_LIMIT = 12 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface Recipient {
  email: string
}

export interface RecipientInputHandle {
  flush: () => string | null
  hasPendingEmail: () => boolean
}

interface RecipientInputProps {
  label: string
  recipients: Recipient[]
  onAdd: (r: Recipient) => void
  onRemove: (email: string) => void
  autoFocus?: boolean
  onPendingChange?: (hasValid: boolean) => void
}

const RecipientInput = forwardRef<RecipientInputHandle, RecipientInputProps>(
  function RecipientInput({ label, recipients, onAdd, onRemove, autoFocus, onPendingChange }, ref) {
    const [inputValue, setInputValue] = useState('')
    const inputValueRef = useRef('')

    const addEmail = useCallback(
      (raw: string) => {
        const email = raw.trim().replace(/,/g, '')
        if (!EMAIL_REGEX.test(email)) return
        if (recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
          setInputValue('')
          inputValueRef.current = ''
          return
        }
        onAdd({ email })
        setInputValue('')
        inputValueRef.current = ''
        onPendingChange?.(false)
      },
      [onAdd, onPendingChange, recipients]
    )

    useImperativeHandle(ref, () => ({
      flush: () => {
        const trimmed = inputValueRef.current.trim().replace(/,/g, '')
        if (EMAIL_REGEX.test(trimmed)) {
          addEmail(trimmed)
          return trimmed
        }
        return null
      },
      hasPendingEmail: () => EMAIL_REGEX.test(inputValueRef.current.trim().replace(/,/g, '')),
    }))

    return (
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
        <div className="input flex min-h-[42px] flex-wrap items-center gap-1.5 py-1.5">
          {recipients.map((r) => (
            <span
              key={r.email}
              className="inline-flex items-center gap-1 rounded-full bg-wago-green/10 px-2.5 py-0.5 text-xs font-medium text-wago-darkgreen"
            >
              {r.email}
              <button type="button" onClick={() => onRemove(r.email)} className="hover:text-red-600">
                ×
              </button>
            </span>
          ))}
          <input
            autoFocus={autoFocus}
            type="text"
            className="min-w-[140px] flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:ring-0"
            placeholder={recipients.length ? '' : 'email@company.com'}
            value={inputValue}
            onChange={(e) => {
              const v = e.target.value
              setInputValue(v)
              inputValueRef.current = v
              onPendingChange?.(EMAIL_REGEX.test(v.trim().replace(/,/g, '')))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addEmail(inputValue)
              }
              if (e.key === 'Backspace' && !inputValue && recipients.length) {
                onRemove(recipients[recipients.length - 1].email)
              }
            }}
            onBlur={() => {
              if (EMAIL_REGEX.test(inputValue.trim().replace(/,/g, ''))) addEmail(inputValue)
            }}
          />
        </div>
        <p className="mt-1 text-xs text-gray-400">Press Enter or comma to add</p>
      </div>
    )
  }
)

export default function EmailComposer({
  isOpen,
  onClose,
  title,
  subtitle,
  defaultSubject,
  defaultMessage,
  defaultTo,
  requireReplyTo = false,
  kitAttachment,
  onSend,
  fromLabel = 'RSM Tools',
}: EmailComposerProps) {
  const [toList, setToList] = useState<Recipient[]>([])
  const [ccList, setCcList] = useState<Recipient[]>([])
  const [bccList, setBccList] = useState<Recipient[]>([])
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage)
  const [copyToSelf, setCopyToSelf] = useState(false)
  const [attachFiles, setAttachFiles] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [toPending, setToPending] = useState(false)
  const [replyTo, setReplyTo] = useState('')

  const toRef = useRef<RecipientInputHandle>(null)
  const ccRef = useRef<RecipientInputHandle>(null)
  const bccRef = useRef<RecipientInputHandle>(null)

  const kitItems = kitAttachment?.items ?? []
  const kitTotalSize = kitItems.reduce((s, i) => s + i.fileSize, 0)
  const primaryBytes = kitAttachment?.primarySizeBytes ?? 0
  const combinedBudget = primaryBytes + kitTotalSize
  const canAttachKit = kitItems.length > 0 && combinedBudget <= KIT_ATTACH_LIMIT
  const showAttachOption = kitItems.length > 0

  useEffect(() => {
    if (isOpen) {
      setToList(defaultTo ? [{ email: defaultTo }] : [])
      setCcList([])
      setBccList([])
      setShowCc(false)
      setShowBcc(false)
      setSubject(defaultSubject)
      setMessage(defaultMessage)
      setCopyToSelf(false)
      setAttachFiles(showAttachOption && canAttachKit)
      setSending(false)
      setError('')
      setToPending(false)
      setReplyTo('')
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const canSend =
    !sending &&
    (toList.length > 0 || toPending) &&
    (!requireReplyTo || EMAIL_REGEX.test(replyTo.trim()) || !copyToSelf)

  const handleSend = async () => {
    setError('')
    const flushedTo = toRef.current?.flush() ?? null
    ccRef.current?.flush()
    bccRef.current?.flush()

    const finalTo = flushedTo
      ? [...toList.map((r) => r.email), flushedTo].filter(
          (e, i, a) => a.findIndex((x) => x.toLowerCase() === e.toLowerCase()) === i
        )
      : toList.map((r) => r.email)

    if (finalTo.length === 0) {
      setError('Add at least one recipient')
      return
    }

    const reply = replyTo.trim()
    if (requireReplyTo && copyToSelf && !EMAIL_REGEX.test(reply)) {
      setError('Enter your email to send a copy to yourself')
      return
    }
    if (reply && !EMAIL_REGEX.test(reply)) {
      setError('Reply-to email is invalid')
      return
    }

    setSending(true)
    try {
      const msg = await onSend({
        to: finalTo,
        cc: ccList.map((r) => r.email),
        bcc: bccList.map((r) => r.email),
        subject,
        message,
        copyToSelf,
        attachFiles: showAttachOption ? attachFiles : undefined,
        replyTo: reply || undefined,
      })
      onClose()
      return msg
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Mail className="h-5 w-5 text-wago-green" />
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={sending}>
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <RecipientInput
            ref={toRef}
            label="To"
            recipients={toList}
            onAdd={(r) => setToList((p) => [...p, r])}
            onRemove={(email) => setToList((p) => p.filter((r) => r.email !== email))}
            onPendingChange={setToPending}
            autoFocus
          />

          {(!showCc || !showBcc) && (
            <div className="flex items-center gap-3 -mt-1">
              {!showCc && (
                <button type="button" onClick={() => setShowCc(true)} className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-wago-darkgreen">
                  <ChevronDown className="h-3 w-3" /> Add CC
                </button>
              )}
              {!showBcc && (
                <button type="button" onClick={() => setShowBcc(true)} className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-wago-darkgreen">
                  <ChevronDown className="h-3 w-3" /> Add BCC
                </button>
              )}
            </div>
          )}

          {showCc && (
            <RecipientInput
              ref={ccRef}
              label="CC"
              recipients={ccList}
              onAdd={(r) => setCcList((p) => [...p, r])}
              onRemove={(email) => setCcList((p) => p.filter((r) => r.email !== email))}
            />
          )}
          {showBcc && (
            <RecipientInput
              ref={bccRef}
              label="BCC"
              recipients={bccList}
              onAdd={(r) => setBccList((p) => [...p, r])}
              onRemove={(email) => setBccList((p) => p.filter((r) => r.email !== email))}
            />
          )}

          {requireReplyTo && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Your email (reply-to)
              </label>
              <input
                type="email"
                className="input w-full text-sm"
                placeholder="you@company.com"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                disabled={sending}
              />
              <p className="mt-1 text-xs text-gray-400">Optional unless you want a copy to yourself.</p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Subject</label>
            <input
              type="text"
              className="input w-full text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Message</label>
            <textarea
              className="input w-full resize-none text-sm leading-relaxed"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
            />
          </div>

          {kitAttachment && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Attachments</p>
              <div className="overflow-hidden rounded-lg border border-gray-200 divide-y divide-gray-100">
                <div className="flex items-center gap-3 bg-gray-50 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-wago-green" />
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {kitAttachment.primaryLabel ?? 'Literature Overview Sheet'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {kitAttachment.primaryDescription ??
                        `PDF with links to all ${kitItems.length} document${kitItems.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">Always included</span>
                </div>
                {showAttachOption &&
                  (canAttachKit ? (
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={attachFiles}
                        onChange={(e) => setAttachFiles(e.target.checked)}
                        disabled={sending}
                        className="h-4 w-4 rounded border-gray-300 text-wago-green focus:ring-wago-green"
                      />
                      <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">
                          {kitAttachment.attachLabel ?? 'Attach literature PDFs'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {kitItems.length} PDF{kitItems.length !== 1 ? 's' : ''} · {formatBytes(combinedBudget)} total
                        </p>
                      </div>
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 bg-amber-50 px-4 py-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-500">Files too large to attach</p>
                        <p className="text-xs text-amber-700">
                          {formatBytes(combinedBudget)} total · recipient can open links in the overview sheet
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={copyToSelf}
              onChange={(e) => setCopyToSelf(e.target.checked)}
              disabled={sending}
              className="h-4 w-4 rounded border-gray-300 text-wago-green focus:ring-wago-green"
            />
            <span className="text-sm text-gray-600">Send a copy to myself</span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
          <p className="text-xs text-gray-400">
            Sent from <span className="font-medium">{fromLabel}</span>
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={sending} className="btn-secondary text-sm">
              Cancel
            </button>
            <button type="button" onClick={handleSend} disabled={!canSend} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
              {sending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
