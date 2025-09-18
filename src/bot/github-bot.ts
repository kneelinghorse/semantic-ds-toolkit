import { Octokit } from '@octokit/rest';
import { PRAnalyzer } from './pr-analyzer';
import { SuggestionEngine } from './suggestion-engine';
import { EvidenceLogger } from './evidence-logger';
import { AnchorStoreManager } from '../core/anchor-store';

export interface GitHubBotConfig {
  githubToken: string;
  webhookSecret?: string;
  baseUrl?: string;
  storePath?: string;
}

export interface PRContext {
  owner: string;
  repo: string;
  pull_number: number;
  sha: string;
  base_ref: string;
  head_ref: string;
}

export interface BotComment {
  body: string;
  position?: number;
  path?: string;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
}

export class GitHubBot {
  private octokit: Octokit;
  private prAnalyzer: PRAnalyzer;
  private suggestionEngine: SuggestionEngine;
  private evidenceLogger: EvidenceLogger;
  private anchorStore: AnchorStoreManager;

  constructor(config: GitHubBotConfig) {
    this.octokit = new Octokit({
      auth: config.githubToken,
      baseUrl: config.baseUrl
    });

    this.anchorStore = new AnchorStoreManager(config.storePath);
    this.prAnalyzer = new PRAnalyzer();
    this.suggestionEngine = new SuggestionEngine(this.anchorStore);
    this.evidenceLogger = new EvidenceLogger();
  }

  async handlePullRequest(context: PRContext): Promise<void> {
    const startTime = Date.now();

    try {
      const prData = await this.getPRData(context);
      const analysis = await this.prAnalyzer.analyzePR(prData);

      if (analysis.hasSemanticChanges) {
        const suggestions = await this.suggestionEngine.generateSuggestions(analysis);
        const comment = this.formatPRComment(context, suggestions, analysis);

        await this.postComment(context, comment);

        await this.evidenceLogger.logAnalysis({
          pr_context: context,
          analysis_result: analysis,
          suggestions: suggestions,
          processing_time_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error handling PR:', error);
      await this.evidenceLogger.logError({
        pr_context: context,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleQuickAccept(context: PRContext, suggestionIds: string[]): Promise<void> {
    try {
      // Attempt to accept by in-memory suggestions first; if missing, load from evidence logs
      const logger = this.evidenceLogger;
      const latest = await logger.getLatestSuggestionsForPR(context);

      if (suggestionIds.length === 1 && (suggestionIds[0] === 'all' || suggestionIds[0].startsWith('accept_all_'))) {
        if (latest && latest.length > 0) {
          for (const m of latest) {
            await this.suggestionEngine.acceptSuggestionByData(m);
          }
        }
      } else {
        for (const suggestionId of suggestionIds) {
          const acceptedInMemory = await this.suggestionEngine.acceptSuggestion(suggestionId);
          if (!acceptedInMemory && latest) {
            const match = latest.find((m: any) => m.id === suggestionId);
            if (match) {
              await this.suggestionEngine.acceptSuggestionByData(match);
            }
          }
        }
      }

      const comment = this.formatAcceptanceComment(suggestionIds);
      await this.postComment(context, comment);

      await this.evidenceLogger.logAcceptance({
        pr_context: context,
        accepted_suggestions: suggestionIds,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error handling quick accept:', error);
      await this.evidenceLogger.logError({
        pr_context: context,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
  }

  private async getPRData(context: PRContext) {
    const [pr, diff, files] = await Promise.all([
      this.octokit.pulls.get({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.pull_number
      }),
      this.octokit.pulls.get({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.pull_number,
        mediaType: { format: 'diff' }
      }),
      this.octokit.pulls.listFiles({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.pull_number
      })
    ]);

    return {
      pr: pr.data,
      diff: typeof diff.data === 'string' ? diff.data : '',
      files: files.data
    };
  }

  private formatPRComment(context: PRContext, suggestions: any, analysis: any): BotComment {
    const { newMappings, driftDetections, healthMetrics } = suggestions;

    let body = `## 🔬 Semantic Analysis for PR #${analysis.prNumber || analysis.pr?.number || 'N/A'}\n\n`;

    if (newMappings && newMappings.length > 0) {
      body += `### ✅ Suggested Mappings (${newMappings.length} new)\n`;
      newMappings.forEach((mapping: any) => {
        const workflowUrl = `https://github.com/${context.owner}/${context.repo}/actions/workflows/semantic-bot.yml`;
        const acceptLink = `[Accept](${workflowUrl})`;
        const command = ` (comment: \`/semantic accept ${mapping.id}\`)`;
        body += `- \`${mapping.column}\` → \`${mapping.semantic_type}\` (${Math.round(mapping.confidence * 100)}% confidence) ${acceptLink}${command}\n`;
      });
      body += '\n';
    }

    if (driftDetections && driftDetections.length > 0) {
      body += `### ⚠️ Drift Detected\n`;
      driftDetections.forEach((drift: any) => {
        body += `- \`${drift.column}\`: ${drift.description}\n`;
        body += `- Action: Update \`/semantics/${drift.file}\`\n`;
      });
      body += '\n';
    }

    if (healthMetrics) {
      body += `### 📊 Semantic Health\n`;
      body += `- Coverage: ${Math.round(healthMetrics.coverage * 100)}%\n`;
      body += `- Drift Risk: ${healthMetrics.driftRisk}\n`;
      body += `- Quality Score: ${Math.round(healthMetrics.qualityScore * 100)}/100\n\n`;
    }

    const acceptAllId = suggestions.acceptAllId || 'all';
    const workflowUrl = `https://github.com/${context.owner}/${context.repo}/actions/workflows/semantic-bot.yml`;
    body += `[Accept All](${workflowUrl}) (comment: \`/semantic accept-all\`) `;
    body += `[Review](https://github.com/owner/repo/blob/main/semantics/) `;
    body += `[Docs](https://docs.semantic-toolkit.org/quick-start)\n\n`;

    body += `---\n*🤖 Generated by [Semantic Data Science Toolkit](https://semantic-toolkit.org) in ${analysis.processingTime || '<5'}s*`;

    return { body };
  }

  private formatAcceptanceComment(suggestionIds: string[]): BotComment {
    const count = suggestionIds.length;
    const body = `✅ **Quick Accept Complete**\n\n` +
      `Accepted ${count} semantic mapping${count > 1 ? 's' : ''}. ` +
      `Mappings have been added to the semantic store.\n\n` +
      `*🤖 Generated by [Semantic Data Science Toolkit](https://semantic-toolkit.org)*`;

    return { body };
  }

  private async postComment(context: PRContext, comment: BotComment): Promise<void> {
    await this.octokit.issues.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.pull_number,
      body: comment.body
    });
  }

  async getRepositorySemantics(owner: string, repo: string): Promise<any> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path: 'semantics'
      });

      if (Array.isArray(data)) {
        const semanticFiles = data.filter(item =>
          item.type === 'file' && item.name.endsWith('.yml')
        );

        const contents = await Promise.all(
          semanticFiles.map(async (file) => {
            const fileData = await this.octokit.repos.getContent({
              owner,
              repo,
              path: file.path
            });
            return {
              name: file.name,
              content: 'content' in fileData.data ?
                Buffer.from(fileData.data.content, 'base64').toString() : ''
            };
          })
        );

        return contents;
      }
    } catch (error) {
      console.log('No semantics directory found, starting fresh');
      return [];
    }
  }

  async createSemanticPR(
    owner: string,
    repo: string,
    mappings: any[],
    baseBranch: string = 'main'
  ): Promise<number> {
    const branchName = `semantic-mappings-${Date.now()}`;

    const { data: baseRef } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`
    });

    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha
    });

    for (const mapping of mappings) {
      const content = this.generateSemanticYAML(mapping);

      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: `semantics/${mapping.dataset}.yml`,
        message: `Add semantic mappings for ${mapping.dataset}`,
        content: Buffer.from(content).toString('base64'),
        branch: branchName
      });
    }

    const { data: pr } = await this.octokit.pulls.create({
      owner,
      repo,
      title: `🔬 Add semantic mappings (${mappings.length} datasets)`,
      head: branchName,
      base: baseBranch,
      body: this.generateSemanticPRBody(mappings)
    });

    return pr.number;
  }

  private generateSemanticYAML(mapping: any): string {
    return `# Semantic mappings for ${mapping.dataset}
dataset: ${mapping.dataset}
version: "1.0"
mappings:
${mapping.columns.map((col: any) => `  - column: ${col.name}
    semantic_type: ${col.semantic_type}
    confidence: ${col.confidence}
    anchor_id: ${col.anchor_id || 'auto-generated'}`).join('\n')}

generated_by: semantic-data-science-toolkit
generated_at: ${new Date().toISOString()}
`;
  }

  private generateSemanticPRBody(mappings: any[]): string {
    const totalColumns = mappings.reduce((sum, m) => sum + m.columns.length, 0);

    return `## 🔬 Semantic Mappings Auto-Generated

This PR adds semantic type mappings for **${totalColumns} columns** across **${mappings.length} dataset(s)**.

### Datasets Updated:
${mappings.map(m => `- \`${m.dataset}\` (${m.columns.length} columns)`).join('\n')}

### Benefits:
- ✅ Enables automatic schema evolution tracking
- ✅ Improves data discovery and lineage
- ✅ Reduces manual mapping overhead
- ✅ Provides semantic consistency across pipelines

### Next Steps:
1. Review the proposed mappings
2. Merge to activate semantic tracking
3. Future PRs will include drift detection and suggestions

---
*🤖 Generated by [Semantic Data Science Toolkit](https://semantic-toolkit.org)*`;
  }

  async validateWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
