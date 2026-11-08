# em-core: the numerics as their own package

`core/` is a self-contained package (its own `package.json`, `README.md`, `LICENSE` and
`test/`), published as the repository
`github.com/interactive-hardware-interfacing/em-core`. This site vendors it as a
**git subtree** at `core/`: the files live in this repo (so the site works offline with no
build step and GitHub Pages serves them as is), while their history can be pushed to and
pulled from the em-core repository.

## One-time split (creates the em-core repository's history from this one)

```
# 1. create an empty repository interactive-hardware-interfacing/em-core on GitHub (no README)
# 2. in intro-EMF-lab, on main, with a clean tree:
npm run core:split            # git subtree split --prefix=core -b em-core-split
git push git@github.com:interactive-hardware-interfacing/em-core.git em-core-split:main
git branch -D em-core-split
```

The split keeps every commit that touched `core/`, rewritten to have `core/` as its root, so
`git log` in em-core shows the solver's history from Phase 0 on.

## Day to day

Edit `core/` here as before. Then:

```
npm run core:push    # send core/ commits to em-core main
npm run core:pull    # bring em-core commits (e.g. from another course) into core/, squashed
```

Both are `git subtree` commands with `--prefix=core`; the pull uses `--squash` so this
repo's history gets one commit per sync. Tag em-core releases independently
(`v1.0.0`, …) when another project pins a version.

## Tests

`core/test/run.js` is em-core's runner (121 checks, `npm test` inside `core/`); the same
check functions are imported by `bench/run.js` here, which adds the app-layer checks and the
golden files. A change to the numerics therefore runs under both runners.

## Using em-core elsewhere

Plain ES modules: copy or subtree the package and `import { Relax2D } from './em-core/relax2d.js'`.
No bundler is needed; a `<script type="module">` on a static page is enough. The solvers
have no DOM dependency and run under node; `render.js` needs a canvas 2D context.
