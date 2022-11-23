---
layout: post
title: Importing Vanilla JS Files
subtitle: How to break up your code into multiple files when using vanilla JS.
gh-badge:
  - follow
tags:
  - javascript
  - html
published: true
---

Here's a little tip which allows you to use ES6 import/export syntax in your vanilla JS files in [supported browsers](https://caniuse.com/es6-module-dynamic-import) (>95% at the time of writing).

You might be used to adding script tags that look like this:

```html
<script type="text/javascript" src="script.js"></script>
```

But what if you want to break up your code into multiple files? You can do this by adding a script tag for each file, but this can get messy, and requires you to consider the order in which you add the script tags.

Instead, you can use the ES6 import/export syntax to import your files as you wish, keeping the structure of your code clean and easy to understand. Simply change the tag type to `module`, and you're good to go!

```html
<script type="module" src="script.js"></script>
```

Now you can use the `import` keyword to import other files:

```js
// foo.js
export function hello() {
  return "Hello World!";
}

// script.js
import { hello } from "./foo.js";
console.log(hello());
```

Easy, right?
