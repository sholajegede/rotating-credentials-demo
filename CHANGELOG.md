# Changelog

All notable changes to this project are documented in this file.

## [0.1.0]

### Added
- Next.js + Convex + Kinde scaffold.
- Closed action registry (`list_records`, `read_record`, `export_records`).
- Static and rotating credential managers for two Kinde M2M agents.
- Convex HTTP action verifying bearer tokens against Kinde's JWKS endpoint.
- Claude-driven agent loop exercising the records API under both credential modes.
- Leak replay proof script: captures both agents' live tokens and replays
  them raw against the API after the rotating agent's window closes.
- Live dashboard showing credential and action history plus the leak proof
  result for both agents.

### Fixed
- Action events from a request with no recognizable token were being logged
  as `mode: "static"` by default. They now log as `mode: "unknown"` so an
  unattributed or malformed request never gets misattributed to the static
  agent's history.
