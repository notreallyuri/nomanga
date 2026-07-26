# FIX

- [x] Small scroll-bar in the library category tabs
  (since it is REALLY SMALL I confused it for a circle for some time)

  Root cause: the `line`-variant active underline sits at `bottom-[-5px]`, below
  the trigger, but the tabs list was clamped to a fixed `h-8` — so the underline
  overflowed vertically, and `overflow-x-auto` promoted `overflow-y` to `auto`,
  surfacing it as a sliver scrollbar. Fixed by letting the list grow (`h-auto` +
  bottom padding); a `no-scrollbar` utility keeps genuine horizontal overflow
  (many categories) clean.
