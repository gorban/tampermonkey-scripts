const { test } = require('node:test');
const assert = require('node:assert/strict');
const { githubFile, branchContext, resolveLink, isSvg, rawUrl, svgPreviewSource, svgFrameSource, fittedSize } = require('../github-svg-modal.user.js');

const source = 'https://github.com/example/graphs/blob/d5/assets/flow.svg';
const context = { owner: 'example', repo: 'graphs', ref: 'd5' };
const placeholder = 'https://github.com/example/graphs/blob/_____switch_branch_____/workflows/flow.md.html#plan';

test('placeholder links use the active branch and retain the file and heading', () => {
    assert.equal(resolveLink(placeholder, source, context), 'https://github.com/example/graphs/blob/d5/workflows/flow.md.html#plan');
    assert.equal(resolveLink(placeholder, source, { ...context, ref: 'main' }), 'https://github.com/example/graphs/blob/main/workflows/flow.md.html#plan');
});

test('branch names containing slashes or spaces remain a single ref', () => {
    assert.equal(resolveLink(placeholder, source, { ...context, ref: 'feature/flow links' }),
        'https://github.com/example/graphs/blob/feature%2Fflow%20links/workflows/flow.md.html#plan');
    assert.equal(branchContext('https://github.com/example/graphs/blob/feature/flow/workflows/flow.md.html', 'feature/flow').path,
        'workflows/flow.md.html');
});

test('placeholder links recorded by an upstream owner stay in the fork being viewed', () => {
    const upstream = placeholder.replace('/example/', '/upstream-owner/');
    assert.equal(resolveLink(upstream, source, { ...context, ref: 'feature/fork-only' }),
        'https://github.com/example/graphs/blob/feature%2Ffork-only/workflows/flow.md.html#plan');
    assert.equal(resolveLink(upstream.replace('/graphs/', '/Graphs/'), source, context),
        'https://github.com/example/graphs/blob/d5/workflows/flow.md.html#plan');
});

test('external source revisions and other repositories are not rewritten', () => {
    const external = 'https://github.com/example/library/blob/abc123/source.py#L12';
    assert.equal(resolveLink(external, source, context), external);
    assert.equal(resolveLink(placeholder.replace('/graphs/', '/other/'), source, context), placeholder.replace('/graphs/', '/other/'));
    assert.equal(resolveLink('https://example.org/_____switch_branch_____', source, context), 'https://example.org/_____switch_branch_____');
});

test('relative links resolve from the SVG document, not the Markdown page', () => {
    assert.equal(resolveLink('../workflow.md.html#review', source, context), 'https://github.com/example/graphs/blob/d5/workflow.md.html#review');
});

test('active URL schemes are rejected while normal navigation stays available', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,test', 'vbscript:example', 'file:///tmp/test']) {
        assert.equal(resolveLink(value, source, context), null);
    }
    assert.equal(resolveLink('mailto:reader@example.org', source, context), 'mailto:reader@example.org');
});

test('raw SVG requests stay on the authenticated GitHub endpoint with no query or fragment', () => {
    assert.equal(rawUrl(`${source}?preview=1#node`), 'https://github.com/example/graphs/raw/d5/assets/flow.svg');
    assert.equal(isSvg(`${source}?preview=1`), true);
    assert.equal(isSvg('https://example.org/file.svg'), false);
    assert.equal(isSvg(source.replace('flow.svg', 'flow.md.html')), false);
    assert.throws(() => rawUrl('https://example.org/file.svg'));
});

test('context validation requires the selected ref to match the actual URL', () => {
    assert.deepEqual(branchContext('https://github.com/example/graphs/blob/d5/workflows/flow.md.html', 'd5'),
        { owner: 'example', repo: 'graphs', ref: 'd5', path: 'workflows/flow.md.html' });
    assert.equal(branchContext(source, 'main'), null);
    assert.equal(branchContext(source, ''), null);
    assert.equal(githubFile('https://github.com/example/graphs/issues/1'), null);
    assert.equal(githubFile('https://github.com/example/graphs/blob/%xx/flow.svg'), null);
    assert.deepEqual(branchContext('https://github.com/example/graphs', 'main'),
        { owner: 'example', repo: 'graphs', ref: 'main', path: '' });
    assert.deepEqual(branchContext('https://github.com/example/graphs/tree/feature/flow', 'feature/flow'),
        { owner: 'example', repo: 'graphs', ref: 'feature/flow', path: '' });
    assert.equal(branchContext('https://github.com/example/graphs/issues/1', 'main'), null);
});

test('fit uses the stricter dimension without altering aspect ratio', () => {
    assert.deepEqual(fittedSize(2000, 1000, 1000, 800), { width: 1000, height: 500 });
    assert.deepEqual(fittedSize(1000, 2000, 1000, 800), { width: 400, height: 800 });
    assert.deepEqual(fittedSize(2000, 1000, 1000, 800, 1.25), { width: 1250, height: 625 });
    assert.throws(() => fittedSize(0, 100, 1000, 800));
});

test('direct SVG previews recognize the file image across GitHub raw URL formats', () => {
    const page = 'https://github.com/example/graphs/blob/d5/.private_resources/diagrams/workflows/planning/flow.svg';
    const path = '.private_resources/diagrams/workflows/planning/flow.svg';
    for (const image of [
        `https://github.com/example/graphs/raw/d5/${path}`,
        `https://github.com/example/graphs/raw/refs/heads/d5/${path}`,
        `https://raw.githubusercontent.com/example/graphs/refs/heads/d5/${path}?token=temporary`,
    ]) assert.equal(svgPreviewSource(page, image), page);
    assert.equal(svgPreviewSource(page, 'https://avatars.githubusercontent.com/u/123'), null);
    assert.equal(svgPreviewSource(page, `https://github.com/example/other/raw/d5/${path}`), null);
    assert.equal(svgPreviewSource(page, `https://github.com/example/graphs/raw/main/${path}`), null);
    assert.equal(svgPreviewSource(page, 'https://github.com/example/graphs/raw/d5/other.svg'), null);
    assert.equal(svgPreviewSource(page.replace('.svg', '.md.html'), page), null);
    assert.equal(svgPreviewSource(page, 'not a URL'), null);
});

test('GitHub cross-origin SVG renderer frames are matched to their repository and path', () => {
    const page = 'https://github.com/example/graphs/blob/feature%2Fflow/.private_resources/diagrams/planning/flow.svg';
    const frame = new URL('https://viewscreen.githubusercontent.com/view/svg');
    frame.searchParams.set('nwo', 'example/graphs');
    frame.searchParams.set('path', '.private_resources/diagrams/planning/flow.svg');
    assert.equal(svgFrameSource(page, frame.href), page);
    assert.equal(svgFrameSource(page, frame.href.replace('viewscreen.githubusercontent.com', 'example.org')), null);
    assert.equal(svgFrameSource(page, frame.href.replace('example%2Fgraphs', 'example%2Fother')), null);
    frame.searchParams.set('path', 'other.svg');
    assert.equal(svgFrameSource(page, frame.href), null);
    assert.equal(svgFrameSource(page.replace('.svg', '.md.html'), frame.href), null);
});

const { fragmentLine } = require('../github-svg-modal.user.js');
const declaration = [
    '# Workflow',                                  // 1
    '',                                            // 2
    '## Tools',                                    // 3
    '',                                            // 4
    '| Port | Instance |',                         // 5
    '| --- | --- |',                               // 6
    '| primary | [primary](cfg/tools/primary.toml) |', // 7
    '',                                            // 8
    '## Node: plan',                               // 9
    '',                                            // 10
    '### Tools',                                   // 11
    '',                                            // 12
    '| Port | Instance | Operations |',            // 13
    '| --- | --- | --- |',                         // 14
    '| lookup | [primary](cfg/tools/primary.toml) | query |', // 15
    '',                                            // 16
    '## Node: render',                             // 17
].join('\n');

test('diagram fragments map to the declaration source line GitHub can highlight', () => {
    assert.equal(fragmentLine(declaration, 'workflow-tools-graph-demo'), 3);
    assert.equal(fragmentLine(declaration, 'workflow-tool-graph-demo-primary'), 7);
    assert.equal(fragmentLine(declaration, 'node-plan'), 9);
    assert.equal(fragmentLine(declaration, 'workflow-tools-node-plan'), 11);
    assert.equal(fragmentLine(declaration, 'workflow-tool-node-plan-lookup'), 15);
    assert.equal(fragmentLine(declaration, 'node-render'), 17);
});

test('standalone component and node documents use their own Tools heading', () => {
    const component = '# Component: draft\n\n## Flow\n\n1.  [node plan](plan.md.html)\n\n## Tools\n\n| Port | Instance |\n| --- | --- |\n| primary | [p](p.toml) |\n';
    assert.equal(fragmentLine(component, 'workflow-tools-component-draft'), 7);
    assert.equal(fragmentLine(component, 'workflow-tool-component-draft-primary'), 11);
    const node = '# Node: plan\n\n## Native\n\n## Tools\n\n| Port | Instance | Operations |\n| --- | --- | --- |\n| lookup | [p](p.toml) | query |\n';
    assert.equal(fragmentLine(node, 'workflow-tools-node-plan'), 5);
    assert.equal(fragmentLine(node, 'workflow-tool-node-plan-lookup'), 9);
    assert.equal(fragmentLine(node, 'node-plan'), 1);
});

test('unknown, malformed and line fragments are left alone', () => {
    for (const fragment of ['L12', 'plan', 'node-missing', 'workflow-tool-node-plan-missing',
        'workflow-tools-node-render', 'workflow-tools-other-plan', 'workflow-tool-graph-demo-']) {
        assert.equal(fragmentLine(declaration, fragment), null, fragment);
    }
});

test('only declaration blobs with diagram fragments are retargeted', () => {
    const { declarationFragment } = require('../github-svg-modal.user.js');
    const blob = 'https://github.com/example/graphs/blob/d5/demo/flow.md.html';
    assert.equal(declarationFragment(blob + '#workflow-tools-graph-demo'), 'workflow-tools-graph-demo');
    assert.equal(declarationFragment(blob + '#workflow-tool-node-plan-lookup'), 'workflow-tool-node-plan-lookup');
    assert.equal(declarationFragment(blob + '#node-plan'), 'node-plan');
    for (const other of [blob + '#L12', blob, blob.replace('/blob/', '/raw/') + '#node-plan',
        'https://github.com/example/graphs/blob/d5/README.md#node-plan', 'https://example.org/flow.md.html#node-plan']) {
        assert.equal(declarationFragment(other), null, other);
    }
});
