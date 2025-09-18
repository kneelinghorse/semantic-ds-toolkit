# GitHub Semantic Analysis Bot Setup Guide

## 🚀 Quick Start (< 20 minutes)

### 1. Create GitHub App (5 minutes)

1. Go to your GitHub organization settings → Developer settings → GitHub Apps
2. Click "New GitHub App"
3. Fill in the required fields:

```yaml
GitHub App Name: Semantic Analysis Bot
Homepage URL: https://semantic-toolkit.org
Description: Automated semantic analysis and mapping suggestions for PRs

Webhook:
  ☐ Active: Unchecked (for now)

Repository permissions:
  ✅ Contents: Read & Write
  ✅ Issues: Write
  ✅ Metadata: Read
  ✅ Pull requests: Write
  ✅ Actions: Read

Organization permissions:
  ✅ Members: Read (optional)

Events:
  ✅ Pull request
  ✅ Push (optional)
```

4. Click "Create GitHub App"
5. **Save the App ID** - you'll need it later
6. Generate and **download the private key** (.pem file)

### 2. Install App on Repository (2 minutes)

1. In your GitHub App settings, click "Install App"
2. Choose your organization/account
3. Select "Selected repositories" and choose your target repo
4. Click "Install"

### 3. Configure Repository Secrets (3 minutes)

Go to your repository → Settings → Secrets and variables → Actions

Add these secrets:

```yaml
GITHUB_TOKEN:
  # Use the default GITHUB_TOKEN (already available)
  # OR create a personal access token with repo scope

SEMANTIC_BOT_APP_ID:
  # The App ID from step 1

SEMANTIC_BOT_PRIVATE_KEY:
  # The contents of the .pem file from step 1
  # Copy the entire file including -----BEGIN/END----- lines
```

### 4. Enable Workflows (2 minutes)

1. Copy the workflow file to `.github/workflows/semantic-bot.yml`
2. Commit and push to your repository
3. Go to Actions tab and verify the workflow appears
4. If needed, enable workflows in your repository settings

### 5. Test the Bot (5 minutes)

Create a test PR with a schema change:

```sql
-- test-migration.sql
ALTER TABLE users ADD COLUMN user_email VARCHAR(255);
ALTER TABLE orders ADD COLUMN total_amount DECIMAL(10,2);
```

Expected bot behavior:
- ✅ Analyzes PR in < 5 seconds
- ✅ Posts semantic suggestions comment
- ✅ Provides one-click Accept buttons
- ✅ Evidence logged to artifacts

### 6. Quick Accept Setup (3 minutes)

The bot generates quick accept URLs like:
```
https://github.com/owner/repo/actions/workflows/semantic-bot.yml/dispatches
```

Users can:
1. Click "Accept" button in PR comment
2. Approve workflow run when prompted
3. Bot commits semantic mappings automatically

## 🔧 Advanced Configuration

### Custom File Patterns

Edit the workflow file to monitor different paths:

```yaml
on:
  pull_request:
    paths:
      - 'my-schemas/**'      # Custom schema location
      - 'data-models/**'     # Custom models location
      - 'etl/**/*.py'        # ETL scripts
      - 'dbt/models/**'      # dbt models
```

### Webhook Setup (Optional)

For real-time responses instead of GitHub Actions:

1. Deploy the bot to a server (Heroku, Railway, etc.)
2. In GitHub App settings, enable webhook:
   ```
   Webhook URL: https://your-bot.herokuapp.com/webhook
   Secret: generate-a-random-secret-key
   ```
3. Update bot code to handle webhook events

### Semantic Store Persistence

For production use, configure persistent storage:

```typescript
// Option 1: Database
const bot = new GitHubBot({
  githubToken: process.env.GITHUB_TOKEN,
  storePath: 'postgresql://user:pass@host/db'
});

// Option 2: Cloud storage
const bot = new GitHubBot({
  githubToken: process.env.GITHUB_TOKEN,
  storePath: 's3://my-bucket/semantic-store'
});
```

### Custom Semantic Types

Define organization-specific semantic types:

```yaml
# semantics/types.yml
semantic_types:
  identity:
    - user_id
    - customer_id
    - account_id
  money:
    - amount_usd
    - price_cents
    - revenue
  temporal:
    - created_at
    - updated_at
    - event_time
```

## 📊 Monitoring & Analytics

### Bot Health Dashboard

Access bot metrics via workflow:

```bash
# Manual trigger
gh workflow run semantic-bot.yml --field action=health_check

# View recent metrics
gh run list --workflow=semantic-bot.yml
```

### Export Evidence Logs

```typescript
const logger = new EvidenceLogger();
await logger.exportLogs(
  'myorg',
  'myrepo',
  '2024-01-01',
  '2024-12-31',
  './semantic-analysis-2024.json'
);
```

## 🔍 Troubleshooting

### Bot Not Triggering

1. **Check workflow file location**: Must be `.github/workflows/semantic-bot.yml`
2. **Verify file patterns**: Make sure changed files match the `paths:` filter
3. **Check permissions**: Bot needs `pull-requests: write` permission
4. **Review action logs**: Look for errors in the Actions tab

### Suggestions Not Appearing

1. **Verify bot permissions**: Check Issues and PR write access
2. **Check file patterns**: Ensure schema changes match detection patterns
3. **Review evidence logs**: Download artifacts to see what bot detected
4. **Test manually**: Trigger workflow with `workflow_dispatch`

### Quick Accept Not Working

1. **Check secrets**: Verify `GITHUB_TOKEN` has correct permissions
2. **Review workflow**: Ensure accept job has proper git config
3. **Check artifacts**: Semantic store should persist between runs
4. **Test suggestion IDs**: Verify suggestion IDs are valid

### Performance Issues

- **Timeout**: Increase `timeout-minutes` in workflow
- **Large diffs**: Bot processes files up to reasonable limits
- **Rate limiting**: Add delays between API calls if needed

## 🎯 Success Metrics

Track these KPIs for viral adoption:

### Developer Experience
- **Time to first suggestion**: < 5 seconds ⚡
- **Quick accept success rate**: > 95% ✅
- **Setup time**: < 20 minutes 🚀

### Adoption Metrics
- **Suggestion acceptance rate**: Target 80%+ 📈
- **Weekly active users**: Developers engaging with bot 👥
- **Semantic coverage**: % of columns with mappings 📊

### Quality Indicators
- **False positive rate**: < 10% ❌
- **Drift detection accuracy**: > 90% 🎯
- **Evidence completeness**: All decisions logged 📝

## 📞 Support

- **Documentation**: [semantic-toolkit.org/docs](https://semantic-toolkit.org)
- **Issues**: Report at [github.com/semantic-toolkit/issues](https://github.com/semantic-toolkit)
- **Community**: Join our Discord for real-time help

---

*🤖 Generated by [Semantic Data Science Toolkit](https://semantic-toolkit.org)*