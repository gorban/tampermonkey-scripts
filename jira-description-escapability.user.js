// ==UserScript==
// @name         Jira Description Escapability
// @namespace    https://github.com/gorban
// @version      0.0.1
// @description  Jira broke something recently that causes unsaved descriptions to be lost when you press `esc`
// @author       gorban
// @match        https://*.atlassian.net/*
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Use capture phase so we run before Jira's handlers and can prevent the cancel
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const editor = document.getElementById('ak-editor-textarea');
        if (!editor || !editor.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);
})();
