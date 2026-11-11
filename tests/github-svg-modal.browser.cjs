// With Playwright available: node tests/github-svg-modal.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pageUrl = 'https://github.com/example/graphs/blob/feature/diagrams/flow.md.html';
const svgUrl = 'https://github.com/example/graphs/blob/feature%2Fdiagrams/assets/flow.svg';
const directSvgUrl = 'https://github.com/example/graphs/blob/feature%2Fdiagrams/.private_resources/diagrams/workflows/components/planning/flow.svg';
const directRawUrl = directSvgUrl.replace('/blob/', '/raw/refs/heads/');
const framePageUrl = `${directSvgUrl}?preview=frame`;
const frameUrl = 'https://viewscreen.githubusercontent.com/view/svg?nwo=example%2Fgraphs&path=.private_resources%2Fdiagrams%2Fworkflows%2Fcomponents%2Fplanning%2Fflow.svg';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    viewBox="0 0 1200 600" onload="window.svgExecuted=true">
    <script>window.svgExecuted=true</script>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://invalid.example/leak" onerror="window.svgExecuted=true"/></div></foreignObject>
    <animate attributeName="href" to="javascript:alert(1)"/>
    <style>.node {fill:rgb(0, 90, 170);stroke:#fff} .leak {fill:url(https://invalid.example/css)}</style>
    <defs><linearGradient id="local"><stop offset="0" stop-color="blue"/></linearGradient></defs>
    <rect width="1200" height="600" fill="url(#local)"/>
    <image href="https://invalid.example/image"/>
    <a xlink:href="https://github.com/example/graphs/blob/_____switch_branch_____/workflows/plan.md.html#review">
        <text x="40" y="80" class="node">Plan</text>
    </a>
    <a xlink:href="https://github.com/example/graphs/blob/_____switch_branch_____/workflows/plan.md.html#workflow-tools-graph-plan">
        <text x="40" y="200" class="node">Tools</text>
    </a>
    <a xlink:href="https://github.com/example/graphs/blob/_____switch_branch_____/workflows/plan.md.html#workflow-tool-graph-plan-primary">
        <text x="40" y="240" class="node">Primary</text>
    </a>
    <a href="javascript:alert(1)"><text x="40" y="120">Unsafe</text></a>
    <a href="https://github.com/example/library/blob/abc123/type.py#L8"><text x="40" y="160">Source</text></a>
</svg>`;

async function run(browser) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const page = await context.newPage();
    const unexpectedRequests = [];
    let rawRequests = 0;
    let delayResponse = false;
    let failResponse = false;
    await page.route('**/*', async route => {
        const url = route.request().url();
        if (url === pageUrl || url === svgUrl) {
            await route.fulfill({ contentType: 'text/html', body: `<button id="ref-picker-repos-header-ref-selector">feature/diagrams</button>
                <main class="markdown-body"><a id="diagram" href="${svgUrl}">Diagram</a></main>` });
        } else if (url === framePageUrl) {
            await route.fulfill({ contentType: 'text/html', body: `<button id="ref-picker-repos-header-ref-selector-wide">feature/diagrams</button>
                <div id="renderer" style="width:100%;height:210px"><iframe title="File display" src="${frameUrl}" style="width:100%;height:210px;border:0"></iframe></div>` });
        } else if (url === frameUrl) {
            await route.fulfill({ contentType: 'text/html', body: '<p>Cross-origin SVG renderer</p>' });
        } else if (url === directSvgUrl) {
            await route.fulfill({ contentType: 'text/html', body: `<button id="ref-picker-repos-header-ref-selector">feature/diagrams</button>
                <img id="avatar" alt="Avatar" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
                <div><img id="file-preview" alt="flow.svg" title="Original preview" role="img" tabindex="7" style="cursor:crosshair" src="${directRawUrl}"></div>` });
        } else if (url === svgUrl.replace('/blob/', '/raw/') || url === directRawUrl || url === directSvgUrl.replace('/blob/', '/raw/')) {
            rawRequests += 1;
            if (delayResponse) await new Promise(resolve => setTimeout(resolve, 100));
            const body = route.request().resourceType() === 'image'
                ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600"><rect width="1200" height="600" fill="white"/></svg>' : svg;
            await route.fulfill(failResponse ? { status: 403, body: 'Denied' } : { contentType: 'image/svg+xml', body });
        } else if (url === 'https://github.com/example/graphs/raw/feature%2Fdiagrams/workflows/plan.md.html') {
            await route.fulfill({ contentType: 'text/plain', body: '# Workflow\n\n## Tools\n\n| Port | Instance |\n| --- | --- |\n| primary | [p](p.toml) |\n' });
        } else if (url === 'https://github.com/example/graphs/blob/feature%2Fdiagrams/workflows/plan.md.html?plain=1') {
            await route.fulfill({ contentType: 'text/html', body: '<p id="L7">| primary |</p>' });
        } else if (url === 'https://github.com/example/graphs/blob/feature%2Fdiagrams/workflows/plan.md.html') {
            await route.fulfill({ contentType: 'text/html', body: '<h1>Plan</h1><h2 id="review">Review</h2>' });
        } else {
            unexpectedRequests.push(new URL(url).origin);
            await route.abort();
        }
    });
    await page.addInitScript({ content: fs.readFileSync(path.join(__dirname, '../github-svg-modal.user.js'), 'utf8') });
    const open = async () => {
        await page.locator('#diagram').click();
        await page.locator('#github-svg-modal svg').waitFor({ state: 'visible' });
    };
    try {
        await page.goto(pageUrl);
        await open();
        const summary = await page.evaluate(() => {
            const root = document.getElementById('github-svg-modal').shadowRoot;
            const drawing = root.querySelector('.canvas').shadowRoot;
            const svg = drawing.querySelector('svg');
            const rect = svg.getBoundingClientRect();
            return { scripts: svg.querySelectorAll('script,foreignObject,animate').length,
                events: Array.from(svg.querySelectorAll('*')).concat(svg).some(n => n.hasAttribute('onload') || n.hasAttribute('onerror')),
                imageHref: svg.querySelector('image').getAttribute('href'),
                unsafeHref: Array.from(svg.querySelectorAll('a')).find(a => a.textContent.includes('Unsafe')).getAttribute('href'),
                css: svg.querySelector('style').textContent,
                planHref: Array.from(svg.querySelectorAll('a')).find(a => a.textContent.includes('Plan')).getAttribute('href'),
                sourceHref: Array.from(svg.querySelectorAll('a')).find(a => a.textContent.includes('Source')).getAttribute('href'),
                ratio: rect.width / rect.height, fits: rect.width <= innerWidth && rect.height <= innerHeight,
                width: rect.width, height: rect.height,
                percentHidden: root.querySelector('output').hidden, executed: window.svgExecuted === true };
        });
        assert.equal(summary.scripts, 0);
        assert.equal(summary.events, false);
        assert.equal(summary.executed, false);
        assert.equal(summary.imageHref, null);
        assert.equal(summary.unsafeHref, null);
        assert.doesNotMatch(summary.css, /invalid\.example/);
        assert.match(summary.css, /fill:rgb\(0, 90, 170\)/);
        assert.equal(summary.planHref, 'https://github.com/example/graphs/blob/feature%2Fdiagrams/workflows/plan.md.html#review');
        assert.equal(summary.sourceHref, 'https://github.com/example/library/blob/abc123/type.py#L8');
        assert.ok(Math.abs(summary.ratio - 2) < 0.001 && summary.fits);
        assert.ok(Math.abs(summary.width - 1068) < 1, 'width-limited SVG fills the viewport minus the single gutter');
        assert.ok(Math.abs(summary.height - 534) < 1);
        assert.equal(summary.percentHidden, true);
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        assert.equal(await page.locator('#github-svg-modal output').textContent(), '125%');
        assert.equal(await page.getByRole('button', { name: 'Fit diagram', exact: true }).isVisible(), true);
        await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
        assert.equal(await page.locator('#github-svg-modal output').isHidden(), true);
        for (const viewport of [{ width: 640, height: 720 }, { width: 1200, height: 500 }]) {
            await page.setViewportSize(viewport);
            await page.waitForFunction(() => {
                const root = document.getElementById('github-svg-modal').shadowRoot;
                const rect = root.querySelector('.canvas').shadowRoot.querySelector('svg').getBoundingClientRect();
                const scale = Math.min((innerWidth - 32) / 1200, (innerHeight - 32) / 600);
                return Math.abs(rect.width - 1200 * scale) < 1 && Math.abs(rect.height - 600 * scale) < 1;
            });
        }
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#github-svg-modal').count(), 0);
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        await open();
        await page.locator('#github-svg-modal .stage').click({ position: { x: 2, y: 2 } });
        assert.equal(await page.locator('#github-svg-modal').count(), 0);
        await open();
        await page.getByRole('button', { name: 'Close SVG viewer', exact: true }).click();
        assert.equal(await page.locator('#github-svg-modal').count(), 0);
        delayResponse = true;
        await page.locator('#diagram').click();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        assert.equal(await page.locator('#github-svg-modal').count(), 0);
        delayResponse = false;
        failResponse = true;
        await page.locator('#diagram').click();
        await page.getByRole('alert').waitFor();
        await page.getByRole('link', { name: 'Open file on GitHub', exact: true }).click();
        await page.waitForURL(svgUrl);
        assert.equal(await page.locator('#github-svg-modal').count(), 0);
        failResponse = false;
        await page.goto(pageUrl);
        await open();
        await page.locator('#github-svg-modal a').filter({ hasText: 'Plan' }).click();
        await page.waitForURL('**/feature%2Fdiagrams/workflows/plan.md.html#review');
        assert.equal(await page.locator('#review').textContent(), 'Review');
        assert.equal(await page.locator('#github-svg-modal').count(), 0);
        await page.goto(pageUrl);
        await open();
        await page.locator('#github-svg-modal a').filter({ hasText: 'Tools' }).click();
        await page.waitForURL('**/feature%2Fdiagrams/workflows/plan.md.html#tools');
        assert.equal(await page.locator('#github-svg-modal').count(), 0);
        await page.goto(pageUrl);
        await open();
        await page.locator('#github-svg-modal a').filter({ hasText: 'Primary' }).click();
        await page.waitForURL('**/feature%2Fdiagrams/workflows/plan.md.html?plain=1#L7');
        await page.goto(directSvgUrl);
        const preview = page.getByRole('button', { name: 'Open interactive SVG', exact: true });
        await preview.click();
        await page.locator('#github-svg-modal svg').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#github-svg-modal a').filter({ hasText: 'Plan' }).getAttribute('href'),
            'https://github.com/example/graphs/blob/feature%2Fdiagrams/workflows/plan.md.html#review');
        await page.keyboard.press('Escape');
        for (const key of ['Enter', 'Space']) {
            await preview.press(key);
            await page.locator('#github-svg-modal svg').waitFor({ state: 'visible' });
            await page.keyboard.press('Escape');
        }
        await page.locator('#avatar').click();
        assert.equal(await page.locator('#github-svg-modal').count(), 0, 'unrelated images are left alone');
        await page.goto(framePageUrl);
        const frameOpener = page.getByRole('button', { name: 'Open interactive SVG', exact: true });
        await frameOpener.waitFor();
        const bounds = await page.evaluate(() => {
            const frame = document.querySelector('iframe').getBoundingClientRect();
            const button = document.querySelector('[data-github-svg-preview]').getBoundingClientRect();
            return { frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
                button: { x: button.x, y: button.y, width: button.width, height: button.height } };
        });
        assert.deepEqual(bounds.button, bounds.frame);
        await frameOpener.click();
        await page.locator('#github-svg-modal svg').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#github-svg-modal a').filter({ hasText: 'Plan' }).getAttribute('href'),
            'https://github.com/example/graphs/blob/feature%2Fdiagrams/workflows/plan.md.html#review');
        await page.keyboard.press('Escape');
        await page.locator('#ref-picker-repos-header-ref-selector-wide').evaluate(button => button.remove());
        await frameOpener.press('Enter');
        await page.locator('#github-svg-modal svg').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#github-svg-modal a').filter({ hasText: 'Plan' }).getAttribute('href'),
            'https://github.com/example/graphs/blob/feature%2Fdiagrams/workflows/plan.md.html#review');
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__gorbanGithubSvgModal.destroy());
        assert.equal(await frameOpener.count(), 0);
        assert.equal(await page.locator('#renderer').evaluate(node => node.style.position), '');
        await page.goto(pageUrl);
        await page.evaluate(({ directSvgUrl, directRawUrl }) => {
            history.pushState({}, '', directSvgUrl);
            const picker = document.createElement('button');
            picker.id = 'ref-picker-repos-header-ref-selector';
            picker.textContent = 'feature/diagrams';
            const image = document.createElement('img');
            image.id = 'file-preview';
            image.src = directRawUrl;
            image.title = 'Original preview';
            image.style.cursor = 'crosshair';
            document.body.replaceChildren(picker, image);
        }, { directSvgUrl, directRawUrl });
        await page.getByRole('button', { name: 'Open interactive SVG', exact: true }).click();
        await page.locator('#github-svg-modal svg').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__gorbanGithubSvgModal.destroy());
        assert.equal(await page.locator('#file-preview').getAttribute('role'), null);
        assert.equal(await page.locator('#file-preview').getAttribute('tabindex'), null);
        assert.equal(await page.locator('#file-preview').getAttribute('title'), 'Original preview');
        assert.equal(await page.locator('#file-preview').evaluate(image => image.style.cursor), 'crosshair');
        assert.deepEqual(unexpectedRequests, []);
        assert.ok(rawRequests >= 5);
        return 'Browser checks passed: fitting, zoom, closing, cleanup, safe SVGs, branch links, direct image/iframe preview clicks and keyboard, renderer-derived refs, SPA navigation and declaration fragments resolved to rendered headings and source rows.';
    } finally { await context.close(); }
}

module.exports = run;
if (require.main === module) {
    (async () => {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ headless: true });
        try { console.log(await run(browser)); } finally { await browser.close(); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
}
