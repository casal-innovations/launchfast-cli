# @launchfasthq/cli

LaunchFast CLI - Authentication and orchestration for LaunchFast projects.

This package handles user authentication via email verification and manages npm tokens for accessing the private LaunchFast installer package.

## How It Works

1. Checks if the user has a valid npm token for `@launchfasthq/install`
2. If not, initiates email verification flow:
   - Prompts for purchase email
   - Sends verification email via LaunchFast API
   - Polls for verification completion
   - Writes npm token to `~/.npmrc`
3. Runs the installer package

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LAUNCHFAST_API` | Base URL for the LaunchFast API | `https://launchfast.pro` |
| `LAUNCHFAST_SKIP_NPM_CHECK` | Set to `true` to skip npm access validation (development only) | `undefined` |
| `LAUNCHFAST_SKIP_INSTALLER` | Set to `true` to skip running the installer (development only) | `undefined` |

## Local Development

### Setup

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Link for local development
npm link
```

### Linking the Installer Package

The CLI dynamically imports `@launchfasthq/installer` at runtime. During local development (before the package is published to npm), you need to link it:

```bash
# In the installer package directory
cd /path/to/launchfasthq/installer
npm link

# In this CLI directory
npm link @launchfasthq/installer
```

### Testing Against Local API

When developing or dogfooding, you can point the CLI to a local LaunchFast server:

```bash
LAUNCHFAST_API=http://localhost:3000 create-launchfast
```

To also skip the npm registry access check (useful when npm packages aren't published yet):

```bash
LAUNCHFAST_API=http://localhost:3000 LAUNCHFAST_SKIP_NPM_CHECK=true create-launchfast
```

When `LAUNCHFAST_SKIP_NPM_CHECK=true` is set, the CLI will print a warning and bypass npm token validation entirely.

To skip running the installer entirely (useful for testing just the authentication flow):

```bash
LAUNCHFAST_API=http://localhost:3000 LAUNCHFAST_SKIP_NPM_CHECK=true LAUNCHFAST_SKIP_INSTALLER=true create-launchfast
```

These options are useful for:
- Testing the full authentication flow locally
- Debugging API integration issues
- Development before npm packages are published

### Scripts

- `npm run build` - Build with tsup
- `npm run dev` - Build in watch mode
- `npm run typecheck` - Run TypeScript type checking

## Architecture

The CLI is the orchestration layer that:
1. Handles authentication with the LaunchFast API
2. Manages npm credentials for private package access
3. Delegates the actual project setup to `@launchfasthq/install`

### Package Dependencies

- `@launchfasthq/install` - The private installer that scaffolds new LaunchFast projects
- `ini` - For parsing/writing `.npmrc` files
- `zod` - For email validation

## API Endpoints Used

- `POST /resources/cli-auth/start` - Initiate email verification
- `GET /resources/cli-auth/status` - Poll for verification status and retrieve token

## License

MIT
