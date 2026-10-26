# Third-Party Notices and Licenses

This project incorporates, adapts, or references components from third-party projects under open-source licenses.

---

## 1. capri-desktop (mochiiwuff/capri-desktop)

Portions of the WebGL sprite shader rig, exposure sheets, window tracking geometry logic, sound synthesis, and visual styling are adapted from [capri-desktop](https://github.com/mochiiwuff/capri-desktop).

**License:** MIT License  
**Copyright:** (c) 2026 Capri Desktop contributors

```text
MIT License

Copyright (c) 2026 Capri Desktop contributors

This license covers the source code of this repository. It does not cover the
character artwork in assets/capri/ and docs/, which belongs to its respective
rights holders (see README).

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

*Note on ported files:* Each TypeScript source file adapted from `mochiiwuff/capri-desktop` includes the header:
`// Adapted from mochiiwuff/capri-desktop (MIT)`

---

## 2. Capri (seanyih/Capri)

Inspiration for personality traits (the engram persona, ironic but precise engineering voice) and neon color palette accents (green / white / magenta) are drawn from [seanyih/Capri](https://github.com/seanyih/Capri). All destructive routines, medium/max cyberpsychosis modes, and security risks from that repository are strictly excluded.

**License:** MIT License  
**Copyright:** (c) 2025 opencode, (c) 2026 seanyih

```text
MIT License

Copyright (c) 2025 opencode
Copyright (c) 2026 seanyih

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. Fonts: Chakra Petch and JetBrains Mono

- **Chakra Petch**: Copyright (c) 2018 Cadson Demak (https://github.com/cadsondemak/chakra-petch). Licensed under SIL Open Font License, Version 1.1.
- **JetBrains Mono**: Copyright (c) 2020 JetBrains s.r.o. (https://github.com/JetBrains/JetBrainsMono). Licensed under SIL Open Font License, Version 1.1.

Distributed locally via `@fontsource` packages for offline operation without CDN dependencies.

---

## 4. Character Rights and Media Notice

Capri / Project Capricorn, Cyberpunk, and Cyberpunk: Edgerunners belong to **CD PROJEKT RED**, **Studio Trigger**, and **Netflix**.

This software is an independent, non-commercial fan project with no commercial affiliation.
Image assets located in `app/assets/capri/` (character cut-outs, cut-ins, intro frames) derive from television frames and fan-made cut-outs. They are **NOT** licensed under MIT and are intended strictly for personal, non-commercial local use. The `app/assets/capri/` directory is excluded via `.gitignore` and must never be distributed publicly.
The application includes graceful fallback placeholders allowing it to execute properly even when character artwork files are absent.
