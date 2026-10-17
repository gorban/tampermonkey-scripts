// ==UserScript==
// @name         GitHub SVG Modal
// @namespace    https://github.com/gorban
// @version      0.1.2
// @description  Open linked SVGs in a fitted, zoomable modal with branch-aware navigation.
// @author       gorban
// @match        https://github.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const PLACEHOLDER = '_____switch_branch_____';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const XLINK_NS = 'http://www.w3.org/1999/xlink';
    const HOST_ID = 'github-svg-modal';
    const INSTANCE = '__gorbanGithubSvgModal';

    function githubFile(value) {
        let url;
        try { url = new URL(value); } catch { return null; }
        if (url.origin !== 'https://github.com') return null;
        const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(blob|raw)\/(.+)$/);
        if (!match) return null;
        try {
            return { url, owner: decodeURIComponent(match[1]), repo: decodeURIComponent(match[2]),
                kind: match[3], tail: decodeURIComponent(match[4]) };
        } catch { return null; }
    }

    function branchContext(value, ref) {
        if (!ref) return null;
        try {
            const url = new URL(value);
            if (url.origin !== 'https://github.com') return null;
            const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
            const [owner, repo, kind, ...tailParts] = parts;
            if (!owner || !repo) return null;
            if (parts.length === 2) return { owner, repo, ref, path: '' };
            if (!['blob', 'raw', 'tree'].includes(kind)) return null;
            const tail = tailParts.join('/');
            const prefix = [ref, `refs/heads/${ref}`, `refs/tags/${ref}`]
                .find(candidate => tail === candidate || tail.startsWith(`${candidate}/`));
            return prefix ? { owner, repo, ref, path: tail.slice(prefix.length + 1) } : null;
        } catch { return null; }
    }

    function resolveLink(value, source, context) {
        let url;
        try { url = new URL(value, source); } catch { return null; }
        if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return null;
        const file = githubFile(url.href);
        if (file && context && file.owner.toLowerCase() === context.owner.toLowerCase()
                && file.repo.toLowerCase() === context.repo.toLowerCase()
                && file.tail.startsWith(`${PLACEHOLDER}/`)) {
            const path = file.tail.slice(PLACEHOLDER.length + 1).split('/').map(encodeURIComponent).join('/');
            url.pathname = `/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}`
                + `/${file.kind}/${encodeURIComponent(context.ref)}/${path}`;
        }
        return url.href;
    }

    function isSvg(value) {
        const file = githubFile(value);
        return !!file && /\.svg$/i.test(file.tail);
    }

    function rawUrl(value) {
        const file = githubFile(value);
        if (!file || !isSvg(value)) throw new Error('Expected a GitHub SVG file link.');
        const url = new URL(file.url);
        url.pathname = url.pathname.replace(/^\/([^/]+)\/([^/]+)\/blob\//, '/$1/$2/raw/');
        url.hash = '';
        url.search = '';
        return url.href;
    }

    function svgPreviewSource(pageUrl, imageUrl) {
        const page = githubFile(pageUrl);
        if (!page || !isSvg(pageUrl)) return null;
        let image = githubFile(imageUrl);
        if (!image) {
            try {
                const url = new URL(imageUrl);
                if (url.origin !== 'https://raw.githubusercontent.com') return null;
                const [owner, repo, ...tail] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
                image = { owner, repo, tail: tail.join('/') };
            } catch { return null; }
        }
        const normalize = tail => tail.replace(/^refs\/(?:heads|tags)\//, '');
        return image.owner?.toLowerCase() === page.owner.toLowerCase()
            && image.repo?.toLowerCase() === page.repo.toLowerCase()
            && normalize(image.tail) === normalize(page.tail) ? page.url.href : null;
    }

    function svgFrameSource(pageUrl, frameUrl) {
        const page = githubFile(pageUrl);
        if (!page || !isSvg(pageUrl)) return null;
        try {
            const frame = new URL(frameUrl);
            const path = frame.searchParams.get('path');
            return frame.origin === 'https://viewscreen.githubusercontent.com' && frame.pathname === '/view/svg'
                && frame.searchParams.get('nwo')?.toLowerCase() === `${page.owner}/${page.repo}`.toLowerCase()
                && path && page.tail.endsWith(`/${path}`) ? page.url.href : null;
        } catch { return null; }
    }

    function fittedSize(width, height, availableWidth, availableHeight, zoom = 1) {
        if (![width, height, availableWidth, availableHeight, zoom].every(n => Number.isFinite(n) && n > 0)) {
            throw new Error('SVG and viewport dimensions must be positive.');
        }
        const scale = Math.min(availableWidth / width, availableHeight / height) * zoom;
        return { width: width * scale, height: height * scale };
    }

    // The same URL and sizing logic can be checked with Node's built-in test runner.
    if (typeof window === 'undefined') {
        if (typeof module !== 'undefined') module.exports = { githubFile, branchContext, resolveLink, isSvg, rawUrl, svgPreviewSource, svgFrameSource, fittedSize };
        return;
    }
    if (location.hostname !== 'github.com' || window.top !== window.self) return;
    window[INSTANCE]?.destroy();

    let modal = null;
    const previewHints = new Map();
    const framePreviews = new Map();

    function previewSource(image) {
        for (const source of [image.currentSrc, image.src, image.getAttribute('data-canonical-src')]) {
            if (!source) continue;
            try {
                const match = svgPreviewSource(location.href, new URL(source, location.href).href);
                if (match) return match;
            } catch { /* A malformed image URL is not the file preview. */ }
        }
        return null;
    }

    function restorePreview(image, original) {
        for (const [name, value] of Object.entries(original.attributes)) {
            if (value === null) image.removeAttribute(name);
            else image.setAttribute(name, value);
        }
        if (original.cursor) image.style.setProperty('cursor', original.cursor, original.priority);
        else image.style.removeProperty('cursor');
        previewHints.delete(image);
    }

    function removeFramePreview(frame, preview) {
        preview.button.remove();
        if (preview.changedPosition && preview.parent.style.position === 'relative') {
            if (preview.position) preview.parent.style.setProperty('position', preview.position, preview.priority);
            else preview.parent.style.removeProperty('position');
        }
        framePreviews.delete(frame);
    }

    function refreshPreviews() {
        for (const [image, original] of previewHints) {
            if (!image.isConnected || !previewSource(image)) restorePreview(image, original);
        }
        for (const [frame, preview] of framePreviews) {
            if (!frame.isConnected || !preview.button.isConnected || frame.parentElement !== preview.parent
                    || !svgFrameSource(location.href, frame.src)) removeFramePreview(frame, preview);
        }
        if (!isSvg(location.href)) return;
        for (const frame of document.querySelectorAll('iframe[src]')) {
            if (framePreviews.has(frame) || !svgFrameSource(location.href, frame.src)) continue;
            const parent = frame.parentElement;
            const button = element('button', { type: 'button', 'aria-label': 'Open interactive SVG',
                title: 'Open interactive SVG', 'data-github-svg-preview': '' });
            const preview = { parent, button, changedPosition: getComputedStyle(parent).position === 'static',
                position: parent.style.getPropertyValue('position'), priority: parent.style.getPropertyPriority('position') };
            if (preview.changedPosition) parent.style.setProperty('position', 'relative');
            button.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;min-width:0;min-height:0;'
                + 'padding:0;margin:0;border:0;border-radius:0;background:transparent;box-shadow:none;z-index:1;cursor:zoom-in';
            button.addEventListener('focus', () => { button.style.outline = '2px solid #0969da'; });
            button.addEventListener('blur', () => { button.style.outline = ''; });
            button.addEventListener('click', event => {
                if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                const source = svgFrameSource(location.href, frame.src);
                if (!source) return;
                event.preventDefault();
                event.stopPropagation();
                openSvg(source, currentContext());
            });
            framePreviews.set(frame, preview);
            parent.append(button);
        }
        for (const image of document.images) {
            if (previewHints.has(image) || image.closest('a,button') || !previewSource(image)) continue;
            previewHints.set(image, { attributes: Object.fromEntries(['role', 'tabindex', 'title', 'aria-label']
                .map(name => [name, image.getAttribute(name)])),
            cursor: image.style.getPropertyValue('cursor'), priority: image.style.getPropertyPriority('cursor') });
            image.setAttribute('role', 'button');
            image.setAttribute('tabindex', '0');
            image.setAttribute('title', 'Open interactive SVG');
            image.setAttribute('aria-label', 'Open interactive SVG');
            image.style.setProperty('cursor', 'zoom-in');
        }
    }

    function currentContext() {
        const picker = document.querySelector('[id^="ref-picker-repos-header-ref-selector"], [id^="branch-picker-repos-header-ref-selector"]');
        const ref = picker?.textContent.trim();
        const context = branchContext(location.href, ref);
        if (context) return context;
        for (const script of document.querySelectorAll('script[data-target$="embeddedData"]')) {
            try {
                const data = JSON.parse(script.textContent);
                const result = branchContext(location.href, data.payload?.refInfo?.name || data.refInfo?.name);
                if (result) return result;
            } catch { /* Other embedded payloads are unrelated to the file view. */ }
        }
        // The renderer supplies the exact file path, disambiguating refs containing slashes.
        for (const frame of document.querySelectorAll('iframe[src]')) {
            if (!svgFrameSource(location.href, frame.src)) continue;
            const path = new URL(frame.src).searchParams.get('path');
            const ref = githubFile(location.href).tail.slice(0, -path.length - 1).replace(/^refs\/(?:heads|tags)\//, '');
            const result = branchContext(location.href, ref);
            if (result?.path === path) return result;
        }
        // No guessed first path segment: refs may themselves contain slashes.
        return null;
    }

    const SVG_TAGS = new Set(('svg g defs desc title metadata a rect circle ellipse line polyline polygon path text tspan '
        + 'textPath use symbol clipPath mask marker pattern linearGradient radialGradient stop image '
        + 'filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting '
        + 'feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR '
        + 'feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting '
        + 'feSpotLight feTile feTurbulence style').split(' '));
    const CSS_PROPERTIES = new Set(('fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray '
        + 'stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit opacity color background-color '
        + 'font font-family font-size font-style font-weight font-variant letter-spacing word-spacing '
        + 'text-anchor dominant-baseline alignment-baseline baseline-shift text-decoration white-space '
        + 'clip-path mask filter marker-start marker-mid marker-end vector-effect paint-order '
        + 'stop-color stop-opacity flood-color flood-opacity lighting-color transform transform-origin '
        + 'display visibility').split(' '));

    function safeDeclarations(style) {
        return Array.from(style).filter(property => CSS_PROPERTIES.has(property)).map(property => {
            const value = style.getPropertyValue(property);
            const withoutLocalUrls = value.replace(/url\(\s*(['"]?)#[\w.:-]+\1\s*\)/gi, '');
            if (/url\s*\(|\\|var\s*\(|attr\s*\(|expression\s*\(|@/i.test(withoutLocalUrls)) return '';
            return `${property}:${value}`;
        }).filter(Boolean).join(';');
    }

    function sanitizedSvg(text, source, context) {
        if (text.length > 10 * 1024 * 1024) throw new Error('This SVG is too large to preview.');
        const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
        const original = parsed.documentElement;
        if (parsed.querySelector('parsererror') || original.localName !== 'svg' || original.namespaceURI !== SVG_NS) {
            throw new Error('GitHub did not return a valid SVG. Check repository access.');
        }
        // Clean the inert XML tree before importing: adoption can activate HTML image handlers.
        const svg = original;
        for (const element of [svg, ...svg.querySelectorAll('*')]) {
            if (element.namespaceURI !== SVG_NS || !SVG_TAGS.has(element.localName)) {
                element.remove();
                continue;
            }
            for (const attr of Array.from(element.attributes)) {
                const name = attr.localName.toLowerCase();
                if (name.startsWith('on') || name === 'base' || name === 'src' || name === 'srcset'
                        || name === 'tabindex' || name === 'autofocus') {
                    element.removeAttributeNode(attr);
                } else if (name === 'style') {
                    element.setAttribute('style', safeDeclarations(element.style));
                } else if (name === 'href') {
                    const raster = /^(?:data:image\/(?:png|jpeg|gif|webp);base64,)[a-z\d+/=\s]+$/i.test(attr.value);
                    if (element.localName === 'a') {
                        const resolved = resolveLink(attr.value, source, context);
                        if (resolved) element.setAttributeNS(attr.namespaceURI, attr.name, resolved);
                        else element.removeAttributeNode(attr);
                    } else if (!/^#[\w.:-]+$/.test(attr.value) && !(element.localName === 'image' && raster)) {
                        element.removeAttributeNode(attr);
                    }
                } else if (/url\s*\(|\\/i.test(attr.value) && !/^url\(\s*(['"]?)#[\w.:-]+\1\s*\)$/i.test(attr.value)) {
                    element.removeAttributeNode(attr);
                }
            }
            if (element.localName === 'a') {
                const href = element.getAttribute('href') || element.getAttributeNS(XLINK_NS, 'href');
                element.removeAttributeNS(XLINK_NS, 'href');
                if (href) element.setAttribute('href', href);
                element.setAttribute('rel', 'noopener noreferrer');
                if (element.getAttribute('target') !== '_blank') element.setAttribute('target', '_self');
            }
            if (element.localName === 'style') {
                const sheet = new CSSStyleSheet();
                try {
                    sheet.replaceSync(element.textContent);
                    element.textContent = Array.from(sheet.cssRules).filter(rule => rule.type === CSSRule.STYLE_RULE
                        && !/:host|::slotted/i.test(rule.selectorText)).map(rule => `${rule.selectorText}{${safeDeclarations(rule.style)}}`).join('\n');
                } catch { element.remove(); }
            }
        }
        // Normalize fixed dimensions into one viewBox so resizing never distorts the diagram.
        const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
        let width, height;
        if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
            [, , width, height] = viewBox;
        } else {
            const length = name => {
                const match = svg.getAttribute(name)?.match(/^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/);
                return match ? Number(match[1]) : 0;
            };
            width = length('width'); height = length('height');
            if (!(width > 0 && height > 0)) throw new Error('SVG needs a viewBox or positive pixel dimensions.');
            svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        }
        svg.removeAttribute('width'); svg.removeAttribute('height');
        svg.style.cssText = 'display:block;width:100%;height:100%';
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        return { svg: document.importNode(svg, true), width, height };
    }

    function element(tag, attributes = {}, text = '') {
        const node = document.createElement(tag);
        for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
        node.textContent = text;
        return node;
    }

    function closeModal() {
        const previous = modal;
        if (!previous) return;
        modal = null;
        previous.controller?.abort();
        previous.observer.disconnect();
        previous.dialog.close();
        previous.host.remove();
        if (previous.overflow) document.body.style.setProperty('overflow', previous.overflow, previous.overflowPriority);
        else document.body.style.removeProperty('overflow');
        if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    }

    function updateSize() {
        if (!modal?.dimensions) return;
        const { stage, canvas, dimensions, zoom, percent, reset, minus, plus } = modal;
        const available = stage.getBoundingClientRect();
        const size = fittedSize(dimensions.width, dimensions.height,
            Math.max(1, available.width), Math.max(1, available.height), zoom);
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;
        percent.textContent = `${Math.round(zoom * 100)}%`;
        percent.hidden = reset.hidden = zoom === 1;
        minus.disabled = zoom <= 0.25;
        plus.disabled = zoom >= 8;
    }

    function createModal() {
        const host = element('div', { id: HOST_ID });
        const shadow = host.attachShadow({ mode: 'open' });
        const style = element('style');
        style.textContent = `
            :host { all:initial; }
            * { box-sizing:border-box; }
            [hidden] { display:none !important; }
            dialog { position:fixed;inset:0;margin:0;border:0;padding:0;width:100vw;height:100dvh;
                max-width:none;max-height:none;overflow:hidden;background:transparent;color:#17202a;
                font:14px/1.4 system-ui,sans-serif; }
            dialog::backdrop { background:rgba(30,35,42,.64); }
            .stage { position:absolute;inset:16px;display:flex;overflow:auto; }
            .canvas { flex:none;margin:auto;background:white;border-radius:6px;
                box-shadow:0 12px 44px #0005; }
            .toolbar { position:absolute;top:16px;right:24px;display:flex;align-items:center;gap:8px; }
            button { display:inline-grid;place-items:center;width:36px;height:36px;padding:0;border:1px solid #c7cbd1;
                border-radius:50%;background:#fff;color:#17202a;cursor:pointer;font:22px/1 system-ui;
                box-shadow:0 3px 12px #0003; }
            button:hover { background:#e9edf2; }
            button:focus-visible,a:focus-visible { outline:3px solid #58a6ff;outline-offset:3px; }
            button:disabled { opacity:.5;cursor:default; }
            output { min-width:52px;text-align:center;padding:6px;border-radius:6px;background:#fff; }
            .message { position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);margin:0;
                max-width:80vw;border-radius:8px;padding:16px 20px;background:white; }
            .message a { display:block;margin-top:8px;color:#0969da; }
        `;
        const dialog = element('dialog', { 'aria-label': 'SVG diagram preview' });
        const stage = element('div', { class: 'stage' });
        const canvas = element('div', { class: 'canvas', hidden: '' });
        const drawing = canvas.attachShadow({ mode: 'open' });
        const toolbar = element('div', { class: 'toolbar', 'aria-label': 'Diagram controls' });
        const button = (label, symbol) => element('button', { type: 'button', 'aria-label': label, title: label }, symbol);
        const reset = button('Fit diagram', '↺');
        const percent = element('output', { 'aria-label': 'Zoom relative to fitted size', 'aria-live': 'polite' });
        const minus = button('Zoom out', '−');
        const plus = button('Zoom in', '+');
        const close = button('Close SVG viewer', '×');
        const message = element('p', { class: 'message', role: 'status' }, 'Loading SVG…');
        reset.hidden = percent.hidden = true;
        minus.disabled = plus.disabled = true;
        toolbar.append(reset, percent, minus, plus, close);
        stage.append(canvas);
        dialog.append(stage, message, toolbar);
        shadow.append(style, dialog);
        const state = { host, dialog, stage, canvas, drawing, reset, percent, minus, plus, message,
            zoom: 1, dimensions: null, controller: null, context: null, focus: document.activeElement,
            overflow: document.body.style.getPropertyValue('overflow'),
            overflowPriority: document.body.style.getPropertyPriority('overflow') };
        state.observer = new ResizeObserver(updateSize);
        modal = state;
        close.addEventListener('click', closeModal);
        dialog.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
        dialog.addEventListener('click', event => {
            if (event.target === dialog || event.target === stage) closeModal();
        });
        const zoomBy = factor => {
            state.zoom = Math.max(0.25, Math.min(8, Math.round(state.zoom * factor * 10000) / 10000));
            updateSize();
        };
        minus.addEventListener('click', () => zoomBy(1 / 1.25));
        plus.addEventListener('click', () => zoomBy(1.25));
        reset.addEventListener('click', () => { state.zoom = 1; updateSize(); stage.scrollTo(0, 0); });
        document.body.append(host);
        document.body.style.setProperty('overflow', 'hidden');
        dialog.showModal();
        close.focus();
        state.observer.observe(stage);
        return state;
    }

    async function openSvg(url, context) {
        const state = modal || createModal();
        state.context = context;
        state.controller?.abort();
        const controller = new AbortController();
        state.controller = controller;
        state.zoom = 1;
        state.dimensions = null;
        state.canvas.hidden = true;
        state.drawing.replaceChildren();
        state.reset.hidden = state.percent.hidden = true;
        state.minus.disabled = state.plus.disabled = true;
        state.message.hidden = false;
        state.message.setAttribute('role', 'status');
        state.message.textContent = 'Loading SVG…';
        const timeout = setTimeout(() => controller.abort('timeout'), 20000);
        try {
            const response = await fetch(rawUrl(url), { credentials: 'same-origin', signal: controller.signal });
            if (!response.ok) throw new Error(`GitHub returned ${response.status} while loading the SVG.`);
            const text = await response.text();
            if (!context && text.includes(PLACEHOLDER)) throw new Error('Cannot identify the current branch. Open the diagram from a repository file or branch view.');
            const { svg, width, height } = sanitizedSvg(text, url, context);
            if (modal !== state || state.controller !== controller || controller.signal.aborted) return;
            svg.addEventListener('click', event => {
                const anchor = event.composedPath().find(node => node instanceof Element && node.localName === 'a');
                const href = anchor?.getAttribute('href');
                if (!href || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                if (anchor.getAttribute('target') === '_blank') return;
                event.preventDefault();
                const destination = new URL(href);
                const source = new URL(url);
                if (destination.origin === source.origin && destination.pathname === source.pathname && destination.hash) {
                    const target = svg.getElementById(decodeURIComponent(destination.hash.slice(1)));
                    if (target) { target.scrollIntoView({ block: 'center', inline: 'center' }); return; }
                }
                if (isSvg(href)) openSvg(href, context);
                else { closeModal(); location.assign(href); }
            });
            state.drawing.append(svg);
            state.dimensions = { width, height };
            state.canvas.hidden = false;
            state.message.hidden = true;
            state.stage.scrollTo(0, 0);
            updateSize();
        } catch (error) {
            if (modal !== state || state.controller !== controller) return;
            state.message.setAttribute('role', 'alert');
            state.message.textContent = controller.signal.aborted ? 'SVG loading timed out.' : error.message;
            state.message.append(element('a', { href: url }, 'Open file on GitHub'));
        } finally { clearTimeout(timeout); }
    }

    function onClick(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (modal && event.composedPath().includes(modal.host)) return;
        const anchor = event.composedPath().find(node => node instanceof HTMLAnchorElement);
        const image = event.composedPath().find(node => node instanceof HTMLImageElement) || anchor?.querySelector('img');
        const source = anchor && isSvg(anchor.href) ? anchor.href : image && previewSource(image);
        if (!source) return;
        event.preventDefault();
        event.stopPropagation();
        openSvg(source, currentContext());
    }

    function onKeydown(event) {
        if (!['Enter', ' '].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
                || !(event.target instanceof HTMLImageElement)) return;
        const source = previewSource(event.target);
        if (!source) return;
        event.preventDefault();
        event.stopPropagation();
        openSvg(source, currentContext());
    }

    const onNavigation = () => { closeModal(); refreshPreviews(); };
    const previewObserver = new MutationObserver(refreshPreviews);
    previewObserver.observe(document, { childList: true, subtree: true,
        attributes: true, attributeFilter: ['src', 'data-canonical-src'] });
    refreshPreviews();
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('turbo:before-render', onNavigation);
    window.addEventListener('popstate', onNavigation);
    window[INSTANCE] = { destroy() {
        closeModal();
        previewObserver.disconnect();
        for (const [image, original] of previewHints) restorePreview(image, original);
        for (const [frame, preview] of framePreviews) removeFramePreview(frame, preview);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeydown, true);
        document.removeEventListener('turbo:before-render', onNavigation);
        window.removeEventListener('popstate', onNavigation);
        delete window[INSTANCE];
    } };
})();
