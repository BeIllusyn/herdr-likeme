# Material file icons

`*.svg` and the `FILE_NAMES` / `FILE_EXTENSIONS` tables in `icons.js` come from
[Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)
5.40.0, MIT licensed (see `LICENSE` here). The artwork is unchanged; `icons.js`
is generated from the theme's `material-icons.json` with its keys lowercased,
because the mod folds a file name's case before looking it up.

Only the icons an entry in those two tables names are copied, plus the theme's
own `file`, `folder` and `folder-open` fallbacks.

To refresh, download the npm package and rerun the generation step:

```sh
npm pack material-icon-theme
tar -xzf material-icon-theme-*.tgz
```

Then copy the icons the tables name into this folder and regenerate `icons.js`
from `package/dist/material-icons.json`.
