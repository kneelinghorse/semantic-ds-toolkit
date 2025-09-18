import * as fs from 'fs/promises';
import * as path from 'path';
import { PRContext } from './github-bot';
import { PRAnalysisResult } from './pr-analyzer';
import { SuggestionResult } from './suggestion-engine';

export interface AnalysisLog {
  pr_context: PRContext;
  analysis_result: PRAnalysisResult;
  suggestions: SuggestionResult;
  processing_time_ms: number;
  timestamp: string;
}

export interface AcceptanceLog {
  pr_context: PRContext;
  accepted_suggestions: string[];
  timestamp: string;
}

export interface ErrorLog {
  pr_context: PRContext;
  error: string;
  timestamp: string;
}

export interface BotMetrics {
  total_prs_analyzed: number;
  total_suggestions_made: number;
  total_suggestions_accepted: number;
  acceptance_rate: number;
  avg_processing_time_ms: number;
  error_count: number;
  last_activity: string;
}

export class EvidenceLogger {
  private logsPath: string;
  private metricsPath: string;

  constructor(logsPath: string = './evidence-logs') {
    this.logsPath = logsPath;
    this.metricsPath = path.join(logsPath, 'metrics.json');
  }

  async ensureLogsDirectory(): Promise<void> {
    try {
      await fs.access(this.logsPath);
    } catch {
      await fs.mkdir(this.logsPath, { recursive: true });
    }
  }

  async logAnalysis(log: AnalysisLog): Promise<void> {
    await this.ensureLogsDirectory();

    const fileName = this.generateLogFileName('analysis', log.pr_context, log.timestamp);
    const filePath = path.join(this.logsPath, fileName);

    const logEntry = {
      type: 'analysis',
      ...log,
      metadata: {
        schema_changes_count: log.analysis_result.schemaChanges.length,
        semantic_file_changes_count: log.analysis_result.semanticFileChanges.length,
        data_file_changes_count: log.analysis_result.dataFileChanges.length,
        suggestions_count: log.suggestions.newMappings.length,
        drift_detections_count: log.suggestions.driftDetections.length,
        risk_level: log.analysis_result.riskLevel
      }
    };

    await fs.writeFile(filePath, JSON.stringify(logEntry, null, 2), 'utf-8');

    // Update metrics
    await this.updateMetrics('analysis', log);

    // Append to daily summary
    await this.appendToDailySummary(logEntry);
  }

  async logAcceptance(log: AcceptanceLog): Promise<void> {
    await this.ensureLogsDirectory();

    const fileName = this.generateLogFileName('acceptance', log.pr_context, log.timestamp);
    const filePath = path.join(this.logsPath, fileName);

    const logEntry = {
      type: 'acceptance',
      ...log,
      metadata: {
        accepted_count: log.accepted_suggestions.length
      }
    };

    await fs.writeFile(filePath, JSON.stringify(logEntry, null, 2), 'utf-8');

    // Update metrics
    await this.updateMetrics('acceptance', log);

    // Append to daily summary
    await this.appendToDailySummary(logEntry);
  }

  async logError(log: ErrorLog): Promise<void> {
    await this.ensureLogsDirectory();

    const fileName = this.generateLogFileName('error', log.pr_context, log.timestamp);
    const filePath = path.join(this.logsPath, fileName);

    const logEntry = {
      type: 'error',
      ...log
    };

    await fs.writeFile(filePath, JSON.stringify(logEntry, null, 2), 'utf-8');

    // Update metrics
    await this.updateMetrics('error', log);

    // Append to daily summary
    await this.appendToDailySummary(logEntry);
  }

  private generateLogFileName(type: string, context: PRContext, timestamp: string): string {
    const date = new Date(timestamp).toISOString().split('T')[0];
    const time = new Date(timestamp).toISOString().split('T')[1].replace(/[:.]/g, '-').split('Z')[0];
    const prId = `${context.owner}-${context.repo}-${context.pull_number}`;
    return `${date}_${time}_${type}_${prId}.json`;
  }

  private async appendToDailySummary(logEntry: any): Promise<void> {
    const date = new Date(logEntry.timestamp).toISOString().split('T')[0];
    const summaryPath = path.join(this.logsPath, `daily-summary-${date}.jsonl`);

    const summaryLine = JSON.stringify({
      timestamp: logEntry.timestamp,
      type: logEntry.type,
      pr: `${logEntry.pr_context.owner}/${logEntry.pr_context.repo}#${logEntry.pr_context.pull_number}`,
      metadata: logEntry.metadata || {}
    }) + '\n';

    try {
      await fs.appendFile(summaryPath, summaryLine, 'utf-8');
    } catch (error) {
      console.error('Error appending to daily summary:', error);
    }
  }

  private async updateMetrics(type: 'analysis' | 'acceptance' | 'error', log: any): Promise<void> {
    let metrics: BotMetrics;

    try {
      const metricsContent = await fs.readFile(this.metricsPath, 'utf-8');
      metrics = JSON.parse(metricsContent);
    } catch {
      // Initialize metrics if file doesn't exist
      metrics = {
        total_prs_analyzed: 0,
        total_suggestions_made: 0,
        total_suggestions_accepted: 0,
        acceptance_rate: 0,
        avg_processing_time_ms: 0,
        error_count: 0,
        last_activity: new Date().toISOString()
      };
    }

    switch (type) {
      case 'analysis':
        metrics.total_prs_analyzed++;
        metrics.total_suggestions_made += (log as AnalysisLog).suggestions.newMappings.length;

        // Update average processing time
        const currentTotal = metrics.total_prs_analyzed - 1;
        const currentAvg = metrics.avg_processing_time_ms;
        const newTime = (log as AnalysisLog).processing_time_ms;
        metrics.avg_processing_time_ms = currentTotal > 0
          ? (currentAvg * currentTotal + newTime) / metrics.total_prs_analyzed
          : newTime;
        break;

      case 'acceptance':
        metrics.total_suggestions_accepted += (log as AcceptanceLog).accepted_suggestions.length;
        break;

      case 'error':
        metrics.error_count++;
        break;
    }

    // Recalculate acceptance rate
    metrics.acceptance_rate = metrics.total_suggestions_made > 0
      ? metrics.total_suggestions_accepted / metrics.total_suggestions_made
      : 0;

    metrics.last_activity = log.timestamp;

    await fs.writeFile(this.metricsPath, JSON.stringify(metrics, null, 2), 'utf-8');
  }

  async getMetrics(): Promise<BotMetrics> {
    try {
      const metricsContent = await fs.readFile(this.metricsPath, 'utf-8');
      return JSON.parse(metricsContent);
    } catch {
      return {
        total_prs_analyzed: 0,
        total_suggestions_made: 0,
        total_suggestions_accepted: 0,
        acceptance_rate: 0,
        avg_processing_time_ms: 0,
        error_count: 0,
        last_activity: 'never'
      };
    }
  }

  async getAnalysisHistory(
    owner: string,
    repo: string,
    days: number = 30
  ): Promise<AnalysisLog[]> {
    await this.ensureLogsDirectory();

    const files = await fs.readdir(this.logsPath);
    const analysisFiles = files.filter(file =>
      file.includes('_analysis_') &&
      file.includes(`${owner}-${repo}-`) &&
      file.endsWith('.json')
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const logs: AnalysisLog[] = [];

    for (const file of analysisFiles) {
      try {
        const filePath = path.join(this.logsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const log = JSON.parse(content);

        if (new Date(log.timestamp) >= cutoffDate) {
          logs.push(log);
        }
      } catch (error) {
        console.error(`Error reading log file ${file}:`, error);
      }
    }

    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async generateReport(
    owner: string,
    repo: string,
    days: number = 30
  ): Promise<{
    summary: BotMetrics;
    recent_activity: any[];
    top_suggestions: any[];
    error_summary: any[];
  }> {
    const metrics = await this.getMetrics();
    const analysisHistory = await this.getAnalysisHistory(owner, repo, days);

    const recentActivity = analysisHistory.slice(0, 10).map(log => ({
      pr_number: log.pr_context.pull_number,
      timestamp: log.timestamp,
      suggestions_count: log.suggestions.newMappings.length,
      processing_time_ms: log.processing_time_ms,
      risk_level: log.analysis_result.riskLevel
    }));

    // Aggregate suggestions by semantic type
    const suggestionCounts: Record<string, number> = {};
    for (const log of analysisHistory) {
      for (const mapping of log.suggestions.newMappings) {
        suggestionCounts[mapping.semantic_type] = (suggestionCounts[mapping.semantic_type] || 0) + 1;
      }
    }

    const topSuggestions = Object.entries(suggestionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ semantic_type: type, count }));

    // Get error summary
    const errorFiles = await fs.readdir(this.logsPath);
    const recentErrorFiles = errorFiles.filter(file =>
      file.includes('_error_') &&
      file.includes(`${owner}-${repo}-`)
    ).slice(0, 5);

    const errorSummary = [];
    for (const file of recentErrorFiles) {
      try {
        const content = await fs.readFile(path.join(this.logsPath, file), 'utf-8');
        const errorLog = JSON.parse(content);
        errorSummary.push({
          pr_number: errorLog.pr_context.pull_number,
          timestamp: errorLog.timestamp,
          error: errorLog.error.substring(0, 100) + '...'
        });
      } catch {
        // Skip malformed error logs
      }
    }

    return {
      summary: metrics,
      recent_activity: recentActivity,
      top_suggestions: topSuggestions,
      error_summary: errorSummary
    };
  }

  async getLatestSuggestionsForPR(pr: PRContext): Promise<any[] | null> {
    try {
      const files = await fs.readdir(this.logsPath);
      const matchPrefix = `_${pr.owner}-${pr.repo}-${pr.pull_number}.json`;
      const analysisFiles = files
        .filter(f => f.includes('_analysis_') && f.endsWith(matchPrefix))
        .sort((a, b) => b.localeCompare(a));
      if (analysisFiles.length === 0) return null;
      const latest = analysisFiles[0];
      const content = await fs.readFile(path.join(this.logsPath, latest), 'utf-8');
      const parsed = JSON.parse(content);
      return parsed?.suggestions?.newMappings || null;
    } catch (e) {
      return null;
    }
  }

  async exportLogs(
    owner: string,
    repo: string,
    startDate: string,
    endDate: string,
    outputPath: string
  ): Promise<void> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const files = await fs.readdir(this.logsPath);
    const relevantFiles = files.filter(file =>
      file.includes(`${owner}-${repo}-`) &&
      file.endsWith('.json')
    );

    const exportData = [];

    for (const file of relevantFiles) {
      try {
        const content = await fs.readFile(path.join(this.logsPath, file), 'utf-8');
        const log = JSON.parse(content);
        const logDate = new Date(log.timestamp);

        if (logDate >= start && logDate <= end) {
          exportData.push(log);
        }
      } catch (error) {
        console.error(`Error processing log file ${file}:`, error);
      }
    }

    const exportContent = {
      export_metadata: {
        owner,
        repo,
        start_date: startDate,
        end_date: endDate,
        exported_at: new Date().toISOString(),
        total_records: exportData.length
      },
      logs: exportData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    };

    await fs.writeFile(outputPath, JSON.stringify(exportContent, null, 2), 'utf-8');
  }

  async cleanupOldLogs(retentionDays: number = 90): Promise<{ deleted: number; errors: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const files = await fs.readdir(this.logsPath);
    let deleted = 0;
    let errors = 0;

    for (const file of files) {
      if (!file.endsWith('.json') && !file.endsWith('.jsonl')) continue;

      try {
        const filePath = path.join(this.logsPath, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deleted++;
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
        errors++;
      }
    }

    return { deleted, errors };
  }
}
