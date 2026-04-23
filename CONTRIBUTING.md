# Contributing to Somtum

First off, thank you for considering contributing to Somtum! It's people like you who make the developer tool ecosystem better for everyone.

## Development Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/riz007/somtum
    cd somtum
    ```

2.  **Install dependencies:**
    Somtum uses `pnpm`. If you don't have it, install it via `npm i -g pnpm`.
    ```bash
    pnpm install
    ```

3.  **Build the project:**
    ```bash
    pnpm build
    ```

4.  **Run tests:**
    Ensure everything is working correctly.
    ```bash
    pnpm test
    ```

## Development Workflow

1.  **Create a branch:**
    ```bash
    git checkout -b feat/your-feature-name
    ```

2.  **Make your changes:**
    Follow the existing code style and ensure you add tests for any new functionality.

3.  **Verify your changes:**
    ```bash
    pnpm typecheck
    pnpm lint
    pnpm test
    ```

4.  **Add a Changeset (Crucial Step):**
    Somtum uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs. **Every Pull Request that changes the code must include a changeset file.**

    Run the following command and follow the prompts:
    ```bash
    pnpm changeset
    ```
    *   Select the package (somtum).
    *   Choose a version bump (patch for fixes, minor for features, major for breaking changes).
    *   Enter a summary of the changes.

    This will generate a small markdown file in the `.changeset/` directory. Commit this file along with your code.

## Why Changesets?

We use Changesets to automate our release process. When your PR is merged into `main`:
1.  GitHub Actions detects the changeset file.
2.  It creates/updates a "Version Packages" PR that bumps the version in `package.json` and updates `CHANGELOG.md`.
3.  Once that PR is merged, the package is automatically published to npm.

Using `pnpm changeset` ensures that your contribution is properly credited in the changelog and that the version is bumped according to SemVer.

## Coding Standards

*   **TypeScript:** Use strict typing where possible. Avoid `any`.
*   **Linting:** Run `pnpm lint` to check for errors.
*   **Formatting:** We use Prettier. Run `pnpm fmt` before committing.
*   **Tests:** We use Vitest. New features should always include unit tests or golden tests.

## Questions?

If you're unsure about anything, feel free to open an issue or start a discussion in a Pull Request!
