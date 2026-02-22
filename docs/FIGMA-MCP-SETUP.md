# Figma MCP – Connect to Cursor

Figma’s MCP server gives Cursor access to your Figma files (design context, variables, components, frame-to-code). You can use either the **desktop** or **remote** server.

---

## Option A: Remote server (no Figma desktop app)

Use this if you don’t want to run the Figma desktop app. You sign in with Figma (OAuth) once.

### 1. Install in Cursor

1. In Cursor: **Settings → Cursor Settings**.
2. Open the **MCP** tab.
3. Click **+ Add new global MCP server** (or use the Figma deep link below).
4. Paste this and save:

```json
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

**Or** use Figma’s install link:  
[Figma MCP – Install in Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=Figma&config=eyJ1cmwiOiJodHRwczovL21jcC5maWdtYS5jb20vbWNwIn0%3D)

### 2. Authenticate

1. In the MCP list, click **Connect** next to Figma.
2. In the browser, click **Allow** to grant access.
3. When you see “Authentication successful” / “Connected to figma”, you’re done.

### 3. Use it

- Copy a link to a **frame or layer** in Figma.
- In Cursor (e.g. Composer/Agent), ask to implement the design at that URL.  
  Cursor will use the node ID from the link; you don’t need to open the URL in a browser.

---

## Option B: Desktop server (Figma desktop app)

Use this if you prefer the server that runs inside the Figma app (e.g. for selection-based context). The server runs at `http://127.0.0.1:3845/mcp`.

### 1. Enable in Figma

1. Install/update the [Figma desktop app](https://www.figma.com/downloads/).
2. Open a **Design** file in the desktop app.
3. Turn on **Dev Mode** (toolbar or **Shift+D**).
4. In the **Inspect** panel, find the **MCP server** section.
5. Click **Enable desktop MCP server**.  
   You should see a message that the server is running.

### 2. Add to Cursor

1. **Cursor → Settings → Cursor Settings → MCP**.
2. **+ Add new global MCP server**.
3. Paste and save:

```json
{
  "mcpServers": {
    "figma-desktop": {
      "url": "http://127.0.0.1:3845/mcp"
    }
  }
}
```

### 3. Use it

- **Selection-based:** Select a frame/layer in Figma, then in Cursor ask to implement the current selection.
- **Link-based:** Copy the link to a frame/layer and ask Cursor to implement the design at that URL.

---

## If you already have other MCP servers

Merge the Figma entry into your existing `mcpServers` in Cursor. Example with another server:

```json
{
  "mcpServers": {
    "cursor-ide-browser": { ... },
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

Use either `"figma"` (remote) or `"figma-desktop"` (desktop), not both with the same name.

---

## Getting a frame-specific link (for design-to-code)

Your link must include a **node-id** so the MCP can return that frame’s design/code.

1. Open the Figma file (e.g. [WAIGO](https://www.figma.com/design/hrpXkYmQhdAknNBM8tkFrO/WAIGO)).
2. In the canvas or layers panel, **select the frame or screen** you want to implement.
3. Right-click the selection → **Copy link** (or **Copy link to selection**).
4. The URL will look like:  
   `https://www.figma.com/design/.../WAIGO?node-id=123-456`  
   Paste that link into Cursor when asking to implement the design.

Without `node-id`, the MCP cannot target a specific frame.

---

## References

- [Figma MCP – Developer docs](https://developers.figma.com/docs/figma-mcp-server/)
- [Figma MCP catalog](https://www.figma.com/mcp-catalog/)
- [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol)
