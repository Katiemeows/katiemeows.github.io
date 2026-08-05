# kat

A cybersecurity research site built with Jekyll and designed for GitHub Pages. Articles are plain Markdown files; the site itself has no runtime dependencies, database, or admin panel.

## Make it yours

Edit `_config.yml` to change the site title, description, name, and email. Then update `about.md` with your own introduction and links.

The main colors are CSS variables at the top of `assets/css/site.css` if you want a different palette.

## Publish a new article

1. Create a file in `_posts` named `YYYY-MM-DD-your-article-title.md`.
2. Add this block at the top:

   ```yaml
   ---
   title: "Your article title"
   ---
   ```

3. Write below it using [Markdown](https://www.markdownguide.org/basic-syntax/), then commit and push. GitHub Pages rebuilds the site automatically.

If an article is dated in the future, Jekyll will keep it hidden until that date.

## Preview locally

The easiest option is Docker:

```bash
docker run --rm --name field-notes-preview -p 4000:4000 -v "$PWD:/srv/jekyll" -w /srv/jekyll jekyll/jekyll:pages jekyll serve --host 0.0.0.0 --force_polling
```

Open `http://localhost:4000`. Changes to articles, templates, and styles rebuild automatically. Press `Ctrl+C` when you are finished.

Alternatively, if you already have Ruby and Bundler installed:

```bash
gem install bundler
bundle install
bundle exec jekyll serve
```

Then open `http://localhost:4000`.

## Publish on GitHub Pages

1. Create a GitHub repository. Naming it `yourusername.github.io` gives you the cleanest URL.
2. Push these files to the repository's `main` branch.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, then select `main` and `/ (root)`.

If you use a normal repository name such as `my-blog`, set `baseurl: "/my-blog"` in `_config.yml` before publishing. The site will be available at `https://yourusername.github.io/my-blog/`.

## Add a custom domain later

In **Settings → Pages**, enter the domain under **Custom domain**. GitHub will create a `CNAME` file in the repository. Then add the DNS records requested by GitHub at your domain provider and enable **Enforce HTTPS** once it becomes available.

When the custom domain is live, set `url` in `_config.yml` to your full domain (for example, `https://example.com`) and reset `baseurl` to `""`.
