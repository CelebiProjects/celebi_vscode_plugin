# Tree performance troubleshooting

The tree loads one directory at a time through the Celebi API. A persistent
Python worker reuses the project and object instances; simultaneous tree
requests share a promise. Debug launches compile the extension before starting.

On macOS, a blank or slow tree can also indicate an unresponsive extension host.
In the observed VS Code 1.135 installation, native sampling found the host
blocked in `GetSystemCACertificates` → `ReadMacOSKeychainCertificates` →
`SecTrustEvaluateWithError`, even after tree data had returned.

For that failure, set this in **VS Code User Settings (JSON)** and restart the
extension development window:

```json
"http.systemCertificatesNode": false
```

This selects the alternative system certificate reader; it does not disable
HTTPS certificate validation. The setting is local to VS Code, not part of this
repository. DITE HTTP requests use the HTTP transport to avoid unnecessary CA
loading in VS Code's fetch wrapper; HTTPS retains the fetch transport.

`[Celebi timing]` messages report worker reuse, Python execution duration,
tree request completion, expansion events, and DITE status requests. Measure
initial Python startup separately from subsequent directory expansion. In the
verified B2D0Phi workspace, six top-level directories completed VS Code's
`reveal(..., { expand: true })` calls in 4–13 ms after this workaround.
