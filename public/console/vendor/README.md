# public/vendor

`cytoscape.min.js` and `cytoscape-LICENSE` are copied unchanged from
`~/dev/ark-skills/viz/vendor/` (`cp`, byte for byte; ark-skills is read-only
for this console). That is Cytoscape.js 3.34.3, per ark-skills'
`viz/README.md`, under its MIT license (`cytoscape-LICENSE`).

sha256:

    5f3b5b529546d5af1fc5628590af033b74511a5b6f789f5f4682845863228b91  cytoscape.min.js
    eb319c6e6f233607f71e8e2f450391751883cfc0eeb3ca7ef574c13d1d9c2203  cytoscape-LICENSE

Loaded by `public/index.html` with `<script src="vendor/cytoscape.min.js" defer>`,
before `app.js`, which uses the global `window.cytoscape` it defines. Nothing
in this file is modified; a future update should be another `cp` from the
same source, with this README's hashes and version note updated to match.
