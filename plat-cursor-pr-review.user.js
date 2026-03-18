// ==UserScript==
// @name         Plat Cursor PR Review
// @namespace    https://github.com/gorban
// @version      0.1.2
// @description  Adds a "Cursor Review" button to GitHub PRs that triggers a Slack workflow
// @author       gorban
// @match        https://github.com/*/*/pull/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM_xmlhttpRequest
// @grant        GM_slackUserId
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    if (window.__cursorPrReviewLoaded) return;
    window.__cursorPrReviewLoaded = true;

    const SLACK_WEBHOOK_URL =
        'https://hooks.slack.com/triggers/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';
    const ORG_ID = 'E0311HDV9TL';
    // https://upload.wikimedia.org/wikipedia/en/d/dc/Perry_the_Platypus.png
    const PERRY_IMG_DATA_URI =
        'data:image/png;base64,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';
    const BUTTON_ID = 'cursor-pr-review-btn';

    function getStrippedPrLink() {
        const match = location.href.match(
            /^(https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+)/
        );
        return match ? match[1] : null;
    }

    function findButtonContainer() {
        const btn = document.querySelector(
            'button[class*="MergeStatusButton"], button[class*="mergeStatusButton"]'
        );
        return btn?.closest('.d-flex.gap-1') ?? null;
    }

    function createButton() {
        var classId = '_' + crypto.randomUUID().split('-').join('');
        var style = document.createElement('style');
        style.innerHTML = `
            .${classId} {
                appearance: none;
                border: var(--borderWidth-thin, .0625rem) solid;
                border-color: var(--button-default-borderColor-rest, var(--color-btn-border));
                border-radius: var(--borderRadius-medium, .375rem);
                color: var(--button-default-fgColor-rest, var(--color-btn-text));
                cursor: pointer;
                font-family: inherit;
                font-size: var(--text-body-size-medium, .875rem);
                font-weight: var(--base-text-weight-medium, 500);
                align-items: center;
                gap: var(--base-size-8, .5rem);
                height: var(--control-medium-size, 2rem);
                min-width: max-content;
                padding: 0 var(--control-medium-paddingInline-normal, .75rem);
                text-align: center;
                -webkit-user-select: none;
                user-select: none;
                background-color: var(--button-default-bgColor-rest);
                box-shadow: var(--button-default-shadow-resting);
                justify-content: space-between;
                -webkit-text-decoration: none;
                text-decoration: none;
                transition: color 80ms cubic-bezier(.65, 0, .35,1), fill 80ms cubic-bezier(.65, 0, .35, 1), background-color 80ms cubic-bezier(.65, 0, .35, 1), border-color 80ms cubic-bezier(.65, 0, .35, 1);
                display: flex;
            }
                .${classId}[aria-expanded='true'] {
                    background-color: var(--button-default-bgColor-active);
                    border-color: var(--button-default-borderColor-active);
                }

                .${classId}:hover {
                    background-color: var(--button-default-bgColor-hover);
                    border-color: var(--button-default-borderColor-hover);
                }

                .${classId}:active {
                    background-color: var(--button-default-bgColor-active);
                    border-color: var(--button-default-borderColor-active);
                }

                .${classId}:disabled,
                .${classId}[aria-disabled='true']:not([data-loading='true']) {
                    color: var(--control-fgColor-disabled);
                    background-color: var(--button-default-bgColor-disabled);
                    border-color: var(--button-default-borderColor-disabled);
                    box-shadow: none;

                    .${classId}:disabled[data-kbd-chord],
                    .${classId}[aria-disabled='true'][data-kbd-chord]:not([data-loading='true']) {
                        background: var(--buttonKeybindingHint-default-bgColor-disabled);
                        color: var(--buttonKeybindingHint-default-fgColor-disabled);
                        border-color: var(--buttonKeybindingHint-default-borderColor-disabled);
                    }
                }
        `;
        document.head.appendChild(style);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = BUTTON_ID;
        btn.classList.add(classId);

        const img = document.createElement('img');
        img.src = PERRY_IMG_DATA_URI;
        img.alt = 'Perry the Platypus';
        Object.assign(img.style, {
            height: '20px',
            width: 'auto',
            borderRadius: '3px',
        });

        const text = document.createElement('span');
        text.textContent = 'Cursor Review';

        btn.append(img, text);
        btn.addEventListener('click', () => onButtonClick(btn));
        return btn;
    }

    function showModal(...contentElements) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '9999',
        });

        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            background: 'var(--bgColor-default, #ffffff)',
            color: 'var(--fgColor-default, #1f2328)',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '460px',
            width: '90vw',
            fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        Object.assign(closeBtn.style, {
            display: 'block',
            marginLeft: 'auto',
            padding: '6px 16px',
            border: '1px solid var(--borderColor-default, rgba(31,35,40,0.15))',
            borderRadius: '6px',
            background: 'var(--bgColor-default, #ffffff)',
            color: 'var(--fgColor-default, #1f2328)',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
        });
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        dialog.append(...contentElements, closeBtn);
        overlay.append(dialog);
        document.body.append(overlay);
    }

    function showSlackLoginModal() {
        const title = document.createElement('h2');
        title.textContent = 'Unable to get Slack User ID';
        Object.assign(title.style, {
            margin: '0 0 16px',
            fontSize: '20px',
            fontWeight: '600',
            color: 'var(--fgColor-attention, #9a6700)',
        });

        const steps = document.createElement('ol');
        Object.assign(steps.style, {
            margin: '0 0 20px',
            paddingLeft: '20px',
            lineHeight: '1.6',
            fontSize: '14px',
        });

        const step1 = document.createElement('li');
        const link = document.createElement('a');
        link.href = `https://app.slack.com/client/${ORG_ID}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Login to the Slack app here';
        Object.assign(link.style, {
            color: 'var(--fgColor-accent, #0969da)',
            textDecoration: 'underline',
        });
        step1.append(link);

        const step2 = document.createElement('li');
        step2.textContent =
            'Close this dialog and click the Cursor Review button again';

        steps.append(step1, step2);
        showModal(title, steps);
    }

    function showErrorModal(btn, statusCode, responseBody) {
        const title = document.createElement('h2');
        title.textContent =
            'Error: Failed to push PR Review request to Slack';
        Object.assign(title.style, {
            margin: '0 0 16px',
            fontSize: '20px',
            fontWeight: '600',
            color: 'var(--fgColor-danger, #d1242f)',
        });

        const statusEl = document.createElement('p');
        statusEl.textContent = `Status code: ${statusCode}`;
        Object.assign(statusEl.style, {
            margin: '0 0 8px',
            fontSize: '14px',
        });

        const bodyLabel = document.createElement('p');
        bodyLabel.textContent = 'Response body:';
        Object.assign(bodyLabel.style, {
            margin: '0 0 4px',
            fontSize: '14px',
        });

        const bodyPre = document.createElement('pre');
        bodyPre.textContent = responseBody || '(empty)';
        Object.assign(bodyPre.style, {
            margin: '0 0 16px',
            padding: '8px',
            fontSize: '12px',
            background: 'var(--bgColor-muted, #f6f8fa)',
            borderRadius: '6px',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
        });

        const troubleHeader = document.createElement('h3');
        troubleHeader.textContent = 'Troubleshooting';
        Object.assign(troubleHeader.style, {
            margin: '0 0 8px',
            fontSize: '16px',
            fontWeight: '700',
        });

        const troubleText = document.createElement('p');
        troubleText.textContent =
            'Check the Slack Workflow for errors. In particular, ensure that the credentials used to connect to the Google Worksheet have not expired.';
        Object.assign(troubleText.style, {
            margin: '0 0 20px',
            fontSize: '14px',
            lineHeight: '1.6',
        });

        showModal(title, statusEl, bodyLabel, bodyPre, troubleHeader, troubleText);
        reenableButton(btn);
    }

    function reenableButton(btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = 'pointer';
    }

    async function onButtonClick(btn) {
        if (btn.disabled) return;

        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';

        const prLink = getStrippedPrLink();
        if (!prLink) {
            console.error('Cursor PR Review: could not extract PR link');
            reenableButton(btn);
            return;
        }

        let slackUserId;
        try {
            slackUserId = await GM_slackUserId(ORG_ID);
        } catch (err) {
            console.error('Cursor PR Review: failed to get Slack user ID', err);
            showSlackLoginModal();
            reenableButton(btn);
            return;
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: SLACK_WEBHOOK_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                RequestedUser: slackUserId,
                GithubPrLink: prLink,
            }),
            onload: (res) => {
                if (res.status >= 200 && res.status < 300) {
                    console.log('Cursor PR Review: sent', res.status);
                } else {
                    console.error('Cursor PR Review: error', res.status, res.responseText);
                    showErrorModal(btn, res.status, res.responseText);
                }
            },
            onerror: (err) =>
                console.error('Cursor PR Review: request failed', err),
        });
    }

    function tryAddButton() {
        if (!getStrippedPrLink()) return;
        if (document.getElementById(BUTTON_ID)) return;

        const container = findButtonContainer();
        if (!container) return;

        container.prepend(createButton());
    }

    // -- SPA navigation handling (mirrors the pattern in github-add-concourse-ci-badge) --

    let debounceTimer;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(tryAddButton, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const origPush = history.pushState;
    history.pushState = function (...args) {
        origPush.apply(this, args);
        setTimeout(tryAddButton, 100);
    };

    const origReplace = history.replaceState;
    history.replaceState = function (...args) {
        origReplace.apply(this, args);
        setTimeout(tryAddButton, 100);
    };

    window.addEventListener('popstate', () => setTimeout(tryAddButton, 100));
    document.addEventListener('turbo:load', () => setTimeout(tryAddButton, 100));
    document.addEventListener('turbo:render', () => setTimeout(tryAddButton, 100));

    tryAddButton();
})();
