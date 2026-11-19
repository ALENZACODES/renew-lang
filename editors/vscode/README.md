# Renew for VS Code

This folder is a local VS Code extension for `.renew` files. It is also a TextMate grammar, in `syntaxes/renew.tmLanguage.json`, which other editors that read TextMate grammars can use.

It is not on the Visual Studio Marketplace, and it is not published from this repository.

To try it in VS Code, copy this folder into your local extensions directory (on Linux or macOS that is usually `~/.vscode/extensions/renew-language`), or open the command palette and choose "Developer: Install Extension from Location" if your build has that command, then point it at this folder. Then open any `.renew` file.

The grammar marks comments, plan names, amounts, rates, durations, and the words the language uses (mortgage, scenario, show, compare, check, explain, payment held, break even, and the rest). It does not type-check a program; run `renew` or the playground for that.
