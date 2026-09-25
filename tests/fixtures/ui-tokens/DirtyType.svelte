<!-- Fixture for tests/checkUiTokens.test.js: raw type values the guard must flag (4) and the forms it accepts. -->
<p class="text-[13px] font-mono">x</p>
<p class="type-body">ok</p>

<style>
  .a { font-family: 'Inter', sans-serif; }
  .b { font: 600 22px/1 var(--zelo-font-ui); }
  .ok1 { font-family: var(--zelo-font-num); }
  .ok2 { font: var(--type-title); letter-spacing: var(--type-title-tracking); }
  .ok3 { font-family: inherit; }
  .ok4 { font-family: monospace; } /* ui-allow: fixture */
</style>
