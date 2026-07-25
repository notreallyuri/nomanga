# TODO

- Add a simple cloudfare bypass:
  - Invokes another window, user pass the cloudfare
  - Returns, the app grabs the cloudfare key.
- Source-based custom rate-limit:
  - So the application may properly follow the source's rate-limiting.
  - (No rate-limit is applied by default, but the developer may set one for the
    source.)
- Updates:
  - [x] Move Update visualization to the bottom of the sidebar.
  - [x] Add a better updates visualization on the bottom of the sidebar,
    allowing users to see anywhere in the app the current state.
    (Persistent sidebar indicator + detailed progress dialog with a per-series
    live log; plus a "Clear" action that dismisses the current updates without
    marking them read.)
  - [ ] Add support for background updates + tray menu implementation.
- Library:
  - [x] Listing layout (Allow user to toggle the layout in the library)
  - [x] Badge Toggle
  - [x] Quick filters
  - [ ] Update Behavior customization
  - [ ] Downloads
- Browse:
  - [ ] Allow name-searching in all sources (does not include source-specific
    filters)
