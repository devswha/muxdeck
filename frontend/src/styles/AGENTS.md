<!-- Parent: ../AGENTS.md -->

# Styles Directory

Custom CSS for Session Manager frontend. Minimal custom styles following utility-first Tailwind approach—most styling handled via Tailwind classes in components.

## Files

### grid.css
Custom grid and layout styles for workspace and session management UI.

**Key Classes:**

#### Layout
- `.session-grid` - Multi-column grid for session tiles (responsive: 1 col mobile, 2 col 768px, 3 col 1280px, 4 col 1536px)
- `.session-tile` - Individual session card container with flex column layout
- `.session-tile.selected` - Blue border + glow on active selection
- `.session-tile.maximized` - Full-screen fixed positioning (z-index 40)

#### Terminal
- `.terminal-container` - Flex container for xterm.js (flex: 1, min-height: 0)
- `background: #1e1e1e` - Dark background matching terminal theme

#### Interactions
- `.dragging` - Reduced opacity (0.4) + grabbing cursor during drag
- `.drop-target` - Light blue background tint (rgba 59,130,246,0.1) when hovering drop zone
- `.drop-target-highlight` - Dashed blue border on active drop target
- `[draggable="true"]` - Grab cursor, changes to grabbing when active

#### Effects
- `.focus-overlay` - Fixed black overlay (rgba 0,0,0,0.5) for modal focus (z-index 30)
- `.session-tile`, `.session-header`, `.terminal-container` - All smooth transitions (0.2s ease-in-out)

#### Scrollbars
- WebKit scrollbar styling for `.terminal-container` children
  - Width/height: 8px
  - Track: `#1e1e1e` (matches terminal bg)
  - Thumb: `#4a4a4a` (dark gray)
  - Thumb hover: `#5a5a5a` (lighter)

## Design Pattern

**Utility-First + Custom Fallback:**
- Primary styling: Tailwind classes in component JSX
- Custom CSS: Only for complex layouts (grid) and interactive states (drag, focus)
- Responsive: CSS media queries for grid column count

**Color Palette (from grid.css):**
- Terminal background: `#1e1e1e`
- Session tile background: `rgb(17, 24, 39)` (gray-900)
- Borders: `rgb(55, 65, 81)` (gray-700)
- Accents: `rgb(59, 130, 246)` (blue-500)
- Focus overlay: `rgba(0, 0, 0, 0.5)`

## Development

### When to Add Styles Here
1. Complex layouts (grids, flexbox arrangements across multiple elements)
2. Interactive state transitions (drag, drop, focus)
3. Responsive breakpoints (media queries)
4. Vendor-specific styling (scrollbars, WebGL renderer hints)

### When to Use Tailwind Classes
1. Single element: colors, spacing, typography
2. Simple flexbox/grid for one component
3. Hover/focus states (use Tailwind's `:hover:`, `:focus:`)
4. Responsive variants (use Tailwind's `sm:`, `md:`, `lg:`)

### Adding New Styles
1. Add class to grid.css with clear scope (e.g., `.workspace-*`, `.session-*`)
2. Document class purpose and element type in this file
3. Use HSL or rgb() for colors (matches current palette)
4. Include media queries if responsive
5. Test across browsers (especially scrollbars)

## Browser Support

- **Modern browsers:** Chrome, Firefox, Safari, Edge
- **Scrollbars:** WebKit-only (-webkit-scrollbar), fallback to default in others
- **Drag & Drop:** Uses native HTML5 API (widely supported)
- **Flex/Grid:** ES2020+ (supported in all modern browsers)

## Performance Notes

- Minimal CSS file size (~2KB)
- Transitions use GPU-accelerated properties (opacity, transform preferred)
- Grid calculations done at layout time, not runtime
- Scrollbar styling non-blocking (visual only)
