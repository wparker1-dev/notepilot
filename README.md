# NotePilot — public GitHub Pages edition

This is the deployable version of the supplied NotePilot local Flask prototype, adapted for **GitHub Pages**. It is a client-side website, with no Python or database server required for the core study experience. Visitors can access the website from a public link, upload *their own* notes, and study independently.

**Start here:** the `index.html` file in this folder is the website. **Do not upload the original `notepilot/.venv`, `notepilot/data`, SQLite database, `.session-key`, or local backups to your public repository.** This package deliberately excludes those files.

## What works without paying for hosting or AI

| Feature | Status |
| --- | --- |
| A publicly accessible GitHub Pages URL | Yes, after publishing |
| Paste notes or upload TXT, MD, text-based PDF, DOCX, PPTX | Yes (PDF/Office readers download public JS libraries) |
| Store notes in one library, combine 1–12 sources | Yes, in each visitor's browser |
| Class-specific flashcards, study guides and practice exams | Yes, rule-based, based on uploaded excerpts |
| Source-linked questions and answers, exact page/slide labels | Yes, labels and original extracted excerpts |
| Mark known / needs review, filter weak cards, prioritize weak areas | Yes |
| Coin rewards for mastered items, cosmetic shop / unlockable themes | Yes |
| Prevent easy coin farming by marking the same item twice | Yes, per-item reward ledger |
| Source lookup helper | Yes, retrieves matching excerpts, **not** generative AI |
| Edit generated items, undo last content edit, persistent chat | Yes |
| Export study set as Markdown or JSON | Yes |
| Export and restore entire workspace backup | Yes |
| Works with no backend or accounts | Yes |
| Truly generative AI study questions, conversational helper, suggested revisions | **Optional**, requires configuring the separate Cloudflare Worker and an AI provider account |
| Synchronize notes between separate browsers/devices or share a single workspace | **Not included**; would require authentication and a hosted database |

**Important limitations:** Notes, study sets, messages, themes and coins live in the **IndexedDB storage of the current browser and origin**. Other visitors cannot view them and your data is **not** stored in GitHub. Browser data clearing, private/incognito browsing, or switching browsers may remove access to that data. Use the *Rewards shop → Download workspace backup* feature regularly, and use *Restore workspace backup* on another browser if moving devices. No account login is included. Scanned PDFs/image-only documents need OCR beforehand. The rule-based generator is useful but is **not AI** and cannot synthesize unsupported explanations.

## Publish to GitHub Pages (no coding changes required)

### A. Create the GitHub repository

1. Download the completed ZIP provided with this answer, and select **Extract All** on Windows. Open the extracted `NotePilot_GitHub_Pages` folder. You should see `index.html`, `config.js`, `static`, and `.github` (hidden folders may require enabling hidden items).
2. Go to **https://github.com/new** and sign into GitHub. Create a repository, for example `notepilot`, with **Public** visibility. For this tutorial, leave **Add a README** unchecked so the repository starts empty.
3. Install Git if you do not already have it: **https://git-scm.com/downloads**. In Windows File Explorer, open the extracted `NotePilot_GitHub_Pages` folder, right-click and select **Open in Terminal** (PowerShell). The terminal must be in the folder **containing** `index.html`.
4. Run these commands **one by one**, replacing `YOUR-USERNAME` with your actual GitHub username:

```powershell
git init
git branch -M main
git add .
git commit -m "Publish NotePilot GitHub Pages site"
git remote add origin https://github.com/YOUR-USERNAME/notepilot.git
git push -u origin main
```

If Git asks for a name/email, configure them with `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`, then retry the commit. GitHub may open a browser for sign-in. GitHub account passwords are not used as Git terminal passwords; use Git Credential Manager, GitHub Desktop, SSH, or a personal access token.

### B. Turn on the website

5. Open the new repository on GitHub. Go to **Settings → Pages**.
6. Under **Build and deployment → Source**, select **GitHub Actions**. The included file `.github/workflows/deploy.yml` will publish the repository as a static site.
7. Open the repository's **Actions** tab. Look for the **Deploy NotePilot to GitHub Pages** workflow. It should run after your push. If it has not run, select the workflow and **Run workflow**. Check that the job succeeded. If the Pages site is still disabled, return to Settings → Pages and select GitHub Actions.
8. Open **Settings → Pages → Visit site**, or go to:

**`https://YOUR-USERNAME.github.io/notepilot/`**

The `notepilot` part is the **exact name of the repository** (case-sensitive). If you choose another name, replace it in the URL. New deployments can take several minutes to become visible.

**After publishing:** When you change any website file later, run:

```powershell
git add .
git commit -m "Update NotePilot"
git push
```

The GitHub Action deploys the changes automatically. This package uses *relative asset paths*, so the site works under a GitHub Pages repository path instead of only at `/`.

### Alternative: GitHub Desktop

If you would rather avoid Git commands, install **https://desktop.github.com/**, add the extracted `NotePilot_GitHub_Pages` folder as a local repository, initialize it, commit all files, and choose **Publish repository** (uncheck *Keep this code private* for standard GitHub Free public Pages). Continue at step B. Keep `.github/workflows/deploy.yml` intact.

## Test the public site

1. Open the GitHub Pages link in an ordinary desktop browser.
2. Click **Load sample notes**, then **Save pasted notes**.
3. Go to **Choose study format**. Create flashcards in **Rule-based** mode.
4. Flip a card, mark it **Got it**, and verify the coin total increases by 5. Mark the same card known again; it should **not** earn more coins.
5. Select **Weak areas first** or **Needs review only**; open a purple source link.
6. Try a source lookup question in the helper, manually edit an item, then **Undo last edit**.
7. Create a study guide and a practice exam; export them.
8. Visit **Rewards shop**, unlock a theme when you have enough coins, refresh the page, and confirm it remains equipped.
9. Download a **workspace backup**; open an incognito window and try restoring it there to test transfer between isolated browser storage.
10. Try a selectable-text PDF, DOCX, and PPTX file. The PDF and Office parsers download open-source libraries from jsDelivr, so the visitor needs an internet connection to parse those formats.

## Optional: enable genuine AI for all visitors

The website does not expose an API key, and GitHub Pages **cannot run** the original local Ollama service or Flask backend. To add AI, deploy the included **Cloudflare Worker** in `optional-ai-worker/`. This is separate from the free website, and your AI provider may charge for requests. Rule-based features remain available even if AI is never configured.

1. Create accounts with **Cloudflare** (https://dash.cloudflare.com) and an AI API provider. The included Worker is written for the **OpenAI Chat Completions API**. You need an OpenAI **API key with billing configured**, which is distinct from a ChatGPT subscription. Set your OpenAI project usage limits/budget before exposing it publicly.
2. Install **Node.js** if needed (https://nodejs.org). From the `optional-ai-worker` folder in your terminal, run:

```powershell
npx wrangler login
npx wrangler kv namespace create RATE_LIMIT
```

3. Copy the created KV namespace **ID**. Edit `optional-ai-worker/wrangler.toml`: replace `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` with that ID. Change `ALLOWED_ORIGIN` to `https://YOUR-USERNAME.github.io` **without** `/notepilot` or a trailing `/`. Keep it exactly the origin of your deployed website. Set the model and daily limit as needed.
4. While still in `optional-ai-worker`, store your AI key **as a secret on Cloudflare**:

```powershell
npx wrangler secret put OPENAI_API_KEY
```

Paste the actual key at the prompt. **Never put this key in `config.js`, Git, a screenshot, or a public `.env` file.**

5. Deploy the Worker:

```powershell
npx wrangler deploy
```

6. Copy the Worker HTTPS URL shown in the output. In the root website folder, edit **`config.js`** to set it:

```javascript
window.NOTEPILOT_CONFIG = {
  aiEndpoint: "https://notepilot-ai.YOUR-SUBDOMAIN.workers.dev"
};
```

7. Commit and push the changed `config.js`. Reload your GitHub Pages website. **Cloud AI (optional)** will become selectable for generating study materials and chatting/revising source-linked items.

**Cost/safety:** A publicly reachable Worker can be abused even with a browser-origin check. The included per-IP KV limit is **approximate**, not a complete security boundary: clients can fake the `Origin` header and rotate IPs. If you plan to share the site widely, also configure Cloudflare WAF/rate-limiting, CAPTCHA/Turnstile or sign-in, logging/alerts, and a strict OpenAI spend budget. Do not expose an unrestricted paid AI endpoint. Excerpts and questions are sent from the visitor's browser to your Worker and then to the AI provider. Tell users before enabling this. The client verifies that returned references exist, but this **does not guarantee generated claims are correct**.

The optional AI generation samples up to **12 excerpts**, so it is **not exhaustive** for long documents; rule-based flashcard generation processes all extracted text sections. AI output can make mistakes. Do not use private course materials in a shared public repository: upload them into the browser only.

## Migrate saved notes from the original Windows Flask prototype (optional)

The original ZIP contains `notepilot/data/notepilot.sqlite3`. **Do not add that file to GitHub.** To import its saved notes into this edition, run this command on your own computer (from the new website's folder) and replace the example paths:

```powershell
py -3 tools/migrate_sqlite_to_backup.py "C:\path\to\original\notepilot\data\notepilot.sqlite3" "C:\Users\YOUR-NAME\Desktop\notepilot-private-backup.json"
```

On your published site, visit **Rewards shop → Restore workspace backup** and select that JSON. Your old study materials and chat history will be imported into the current browser. The separate reward shop starts with zero coins. Keep the private backup **off GitHub**.

## Edit and test locally

For quick development checks, `index.html` can run under a local static server; no Flask app is needed:

```powershell
py -3 -m http.server 8000
```

Open `http://localhost:8000/`. Modern Chrome, Edge, or Firefox with IndexedDB enabled is recommended. Use the exact same URL for persistent storage; `localhost` and your public GitHub Pages origin are different storage locations.

A Node.js **simulated-IndexedDB regression test** is included:

```powershell
node tests/test_api.cjs
node --check static/web_api.js
node --check static/app.js
```

The simulated test covers study generation, source references, review persistence, reward deduplication, shop transactions, manual editing/undo, chat and document deletion. It is **not** equivalent to testing actual browsers, PDF/Office parsing, a live GitHub deployment, or the optional paid AI service.

## File layout

```text
index.html                         Static website and screens
config.js                          Optional public AI Worker URL (no secrets!)
static/app.js                       Interface and study screens
static/web_api.js                   IndexedDB, extraction, rules, rewards, source helper
static/style.css                    Original theme and new shop/themes
.github/workflows/deploy.yml       GitHub Pages automatic deployment
optional-ai-worker/worker.js       Optional server-side AI integration
optional-ai-worker/wrangler.toml   Example Cloudflare settings (replace placeholders)
tools/migrate_sqlite_to_backup.py  Converts your OLD private local database to backup JSON
tests/test_api.cjs                 Simulated IndexedDB data-layer regression test
```

Official references: [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [GitHub Pages automatic deployment](https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically), [Cloudflare Workers KV commands](https://developers.cloudflare.com/workers/wrangler/commands/kv/).
