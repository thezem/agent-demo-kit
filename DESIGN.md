# agent-demo-kit visual system

## Direction

**Dim elegant** is the enduring house style for agent-demo-kit marketing, documentation, and package-owned UI. It adapts the quiet-intelligence system: generous editorial spacing, Nimbus Sans, clear hierarchy, and restrained material depth. The mood is low-light rather than glossy or neon. A third-party app shown in a demo keeps its own design; the kit should not impose this style on the app being demonstrated.

## Tokens

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#17191d` | Main background |
| Raised field | `#202329` | Product examples and section changes |
| Elevated panel | `#282c32` | Only when containment clarifies content |
| Primary ink | `#f1f0ed` | Headings and controls |
| Secondary ink | `#a9abb2` | Explanation and supporting metadata |
| Divider | `#3a3d45` | Thin boundaries |
| Accent | `#c6bfdf` | Selected state and key emphasis |
| Focus | `#dcd4ff` | 2px visible keyboard outline |

No blue-purple gradient, glow, decorative grid, or blanket glass treatment. Use lavender in one or two focal roles per view. Treat shadows as depth for a genuine overlay, not general decoration.

## Type and composition

- Use the bundled Nimbus Sans regular for copy and large display text, bold only for emphasis. Use DejaVu Mono only for commands and code.
- Wide content: `min(100% - 64px, 1420px)`, narrowing to `100% - 36px` on mobile.
- Landing display: roughly `clamp(62px, 7.6vw, 118px)` with tight tracking and line height. Scale down if the actual words clip.
- Sections breathe at 80–130px vertical intervals. Keep related explanation, code, and proof close together.
- Most content sits directly on the canvas. Use a framed surface for the real browser capture or copyable command, not for every paragraph.
- Controls are compact pills with a clear hover and focus state. Inputs retain labels, borders, and readable placeholders.
- Motion clarifies a user action or state change. Honor reduced-motion preferences.

## Product truth

- Show the actual React example and real result data when claiming behavior.
- The package is currently a private source preview. Do not imply public npm availability or external adoption.
- Explain that browser assertions verify the scripted checks, not every aspect of the feature.
- Every visible link and control must work. Do not add filler metrics, logos, testimonials, or fake terminal output.

## Scope

Use this system for `landing/`, future docs, and the package-owned demo card. The `example/` app intentionally represents a third-party product with its own Fieldnotes visual identity.
