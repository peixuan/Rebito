<template>
  <svg class="creek-mark" viewBox="0 0 280 70" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="ripples" width="29" height="7" patternUnits="userSpaceOnUse">
        <path d="M0 3h9m5 1h6m2-3h5" fill="none" stroke="currentColor" opacity=".32" />
      </pattern>
      <pattern id="reeds" width="12" height="13" patternUnits="userSpaceOnUse">
        <path d="m0 14 8-13M3 13l8-7m-2 8 3-5" stroke="currentColor" fill="none" />
      </pattern>
    </defs>
    <g class="creek-day">
      <path fill="#f1ecdd" d="M0 0h280v70H0z" />
      <path fill="url(#ripples)" d="M0 0h280v70H0z" />
      <path
        fill="#9aaeb2"
        d="M0 0h205c-18 9-42 11-49 15-8 5-51 9-61 15-21 12-48 17-95 22zM280 17c-20 18-20 25-35 33l-42 20h77z"
      />
      <path
        fill="url(#reeds)"
        d="M0 0h205c-18 9-42 11-49 15-8 5-51 9-61 15-21 12-48 17-95 22zM280 17c-20 18-20 25-35 33l-42 20h77z"
      />
      <g fill="none" stroke="currentColor" stroke-linecap="round">
        <path
          stroke-width="2"
          d="M10 48Q19 15 45 1M22 41Q18 16 26 0M30 37Q44 12 63 10M241 64q12-26 33-32M252 60q0-22 16-43"
        />
        <path
          d="M0 51q45-7 91-22t71-17M211 70q25-11 42-27M18 50l23-3m-12 5 28-5m9-7 20-3m109 14 21-2m-28 7 18-2"
        />
      </g>
      <g transform="rotate(-19 165 38)" stroke="#30485a" stroke-linejoin="round">
        <path fill="#657a84" d="M124 42q29-24 78-20-15 31-60 33z" />
        <path fill="#bf9e7b" d="M128 41q29-18 68-16-22 22-52 25z" />
        <path fill="none" d="m141 37 13 10m-5-16 15 12m-8-15 16 10m-6-11 16 8" />
        <path stroke-width="2.5" d="m144 21 30 34" />
        <path fill="#a0896d" d="m139 18 5 1 5 8-3 2z" />
      </g>
    </g>
    <g class="creek-night" shape-rendering="crispEdges">
      <path fill="#233649" d="M0 0h280v70H0z" />
      <path
        fill="#516b80"
        d="M0 17h19v-7h22V7h22v5h21v5h20v4h27v4H0zm170 4h12v-5h15v-5h20v4h17v6h23v3h-87z"
      />
      <path fill="#384f66" d="M0 26h280v44H0z" />
      <path fill="url(#ripples)" d="M0 26h280v44H0z" />
      <path
        fill="#182b3c"
        d="M0 24h65v4h38v3h-15v4H60v5H37v4H16v4H0zm280-4h-19v12h-7v7h-15v9h-15v7h-18v7h-17v8h91z"
      />
      <path fill="#152639" d="M34 10h22v2h7v3h7v3H20v-3h8v-3h6zm-6 8h4v9h-4zm27 0h4v10h-4z" />
      <path fill="#ddb380" d="M38 18h7v6h-7zM38 33h9v1h-9zm3 3h7v1h-7z" />
      <path fill="#142635" d="M135 47h12v-4h16v-4h18v-3h17v5h-6v4h-9v4h-17v4h-22v-2h-9z" />
      <path
        fill="#b49474"
        d="M144 46h13v-3h16v-3h18v2h-11v3h-15v3h-21zm10-12h4v4h5v4h5v4h5v3h-6v-4h-5v-4h-5v-4h-3z"
      />
    </g>
  </svg>
</template>

<style scoped>
.creek-mark {
  display: block;
  width: 100%;
  height: 100%;
  color: #40596c;
}
.creek-night,
:global(.dark .creek-mark .creek-day) {
  display: none;
}
:global(.dark .creek-mark .creek-night) {
  display: inline;
  color: #acc2cd;
}
</style>
