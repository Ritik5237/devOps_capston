const { GoogleGenAI } = require('@google/genai');

/**
 * Helper to get the GenAI client if GEMINI_API_KEY is configured
 */
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_gemini_api_key')) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * 1. AI Task Breakdown: Deconstruct a task into structured steps, criteria & suggestions
 */
async function breakdownTask({ title, description, priority }) {
  const ai = getGenAIClient();

  if (!ai) {
    return getMockTaskBreakdown(title, description, priority);
  }

  const prompt = `You are an expert agile project manager and productivity assistant.
Analyze this task and break it down into an actionable, professional plan.

Task Title: "${title}"
Current Description: "${description || 'None provided'}"
Current Priority: "${priority || 'Medium'}"

Respond ONLY with valid JSON (no markdown formatting, no code fences):
{
  "enhancedTitle": "Refined and clear action-oriented title",
  "summary": "Clear 2-sentence overview of the objective",
  "suggestedPriority": "High | Medium | Low",
  "subtasks": [
    "Step 1: Actionable step with clear outcome",
    "Step 2: Actionable step with clear outcome",
    "Step 3: Actionable step with clear outcome",
    "Step 4: Actionable step with clear outcome"
  ],
  "estimatedTime": "e.g., 2-3 hours",
  "acceptanceCriteria": "Clear condition that marks this task as successfully done",
  "proTip": "One high-value practical tip to succeed faster"
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text ? response.text.trim() : '';
    const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn(`[GeminiService] Live API call failed (${err.message}). Using fallback engine.`);
    return getMockTaskBreakdown(title, description, priority);
  }
}

/**
 * Helper to clean and format action titles, stripping out metadata tokens (priority, status, dates)
 */
function cleanTaskTitle(rawText) {
  if (!rawText || typeof rawText !== 'string') return 'Task Deliverable';

  let cleaned = rawText.trim();

  // 1. Normalize common typos and shortcuts
  cleaned = cleaned
    .replace(/\b(tom+ar+ow|tom+or+ow|tom+or+o|tmrw|tmw)\b/gi, 'tomorrow')
    .replace(/\b(todai|2day)\b/gi, 'today')
    .replace(/\b(priorty|prio)\b/gi, 'priority')
    .replace(/\b(progres+|in-progress)\b/gi, 'in progress')
    .replace(/\b(pend?ing)\b/gi, 'pending')
    .replace(/\b(compl?eted?)\b/gi, 'completed');

  // 2. Strip priority tokens and phrases
  cleaned = cleaned.replace(/\b(?:priority\s*:?\s*(?:high|medium|low|urgent|critical|normal)|(?:high|medium|low|urgent|critical|normal)\s*priority)\b/gi, '');
  cleaned = cleaned.replace(/\b(?:priority\s+(?:is\s+)?(?:high|medium|low))\b/gi, '');
  cleaned = cleaned.replace(/\b(urgent|critical|asap|p[0-3])\b/gi, '');
  cleaned = cleaned.replace(/\bpriority\b/gi, '');

  // 3. Strip status tokens and phrases
  cleaned = cleaned.replace(/\b(?:status\s*:?\s*)?(?:in[- ]progress|wip|doing|working on|actively working|completed|done|finished|pending|todo|to[- ]do)\b/gi, '');
  cleaned = cleaned.replace(/\bstatus\b/gi, '');

  // 4. Strip date and schedule tokens
  cleaned = cleaned.replace(/\b(?:due\s*(?:date|on|by)?\s*:?\s*)?(?:today|tonight|tomorrow|yesterday|eod|end of day)\b/gi, '');
  cleaned = cleaned.replace(/\b(?:by|on|before|until|for)\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|this\s+week|eod)\b/gi, '');
  cleaned = cleaned.replace(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '');
  cleaned = cleaned.replace(/\b(?:next\s+week|this\s+week)\b/gi, '');

  // 5. Strip dangling prepositions, conjunctions, punctuation, and leading prefixes
  cleaned = cleaned
    .replace(/\s+(?:by|on|at|due|with|for|in|to|and|is|as)\s*$/gi, '')
    .replace(/^(?:task|todo|to-do|reminder):\s*/gi, '')
    .replace(/^[,\s;:\-\/]+|[,\s;:\-\/]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) cleaned = rawText.trim();

  // 6. Convert to polished Title Case
  const minorWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'in', 'of']);
  const words = cleaned.split(' ');
  const formattedWords = words.map((word, idx) => {
    const lower = word.toLowerCase();
    if (idx > 0 && minorWords.has(lower)) {
      return lower;
    }
    if (/^(k8s|aws|api|ui|ux|rest|crud|jwt|sql|db|ci\/cd|pr|hpa|pvc|iam|yaml|json)$/i.test(word)) {
      return word.toUpperCase();
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  return formattedWords.join(' ');
}

/**
 * Generate rich domain-tailored objective, checklist, and acceptance criteria
 */
function generateBestObjectiveAndChecklist(title, priority, dueDate, status) {
  const isCapstone = /capstone|thesis|dissertation|viva|rubric|faculty|submission|submit.*project|final.*project/i.test(title);
  const isDevOps = /docker|k8s|kubernetes|jenkins|pipeline|ci\/cd|terraform|ansible|helm|cloud|aws|deploy|infra|container/i.test(title);
  const isBug = /fix|bug|error|issue|crash|patch|hotfix|leak|failure/i.test(title);
  const isTest = /test|jest|unit|integration|coverage|cypress|smoke|e2e/i.test(title);
  const isUI = /frontend|ui|ux|css|html|dashboard|modal|theme|styling|responsive/i.test(title);

  let summary = '';
  let steps = [];
  let acceptanceCriteria = '';

  if (isCapstone) {
    summary = `Finalize, validate, and deliver all core deliverables for "${title}", ensuring clean code repositories, passing automated test suites, complete architecture documentation, and full readiness for faculty review and evaluation.`;
    steps = [
      `Synchronize git repository branches, clean up working tree, and tag production release`,
      `Execute automated test suites (Jest/Supertest) and verify zero failing assertions`,
      `Compile capstone project report, architecture diagrams, and milestone delivery summaries`,
      `Dry-run live demonstration script covering REST API, AI features, Docker, and Kubernetes`,
      `Package and submit project artifacts through the official evaluation portal`
    ];
    acceptanceCriteria = `All capstone requirements, documentation, test reports, and live demonstration environments are verified, error-free, and submitted on time.`;
  } else if (isDevOps) {
    summary = `Architect, implement, and validate production-ready cloud-native automation for "${title}" to ensure reproducible, zero-downtime deployment.`;
    steps = [
      `Review environment configurations, security parameters, and dependency prerequisites`,
      `Author and validate declarative infrastructure/container manifests and playbooks`,
      `Run local container health probes and verify automated smoke test pass rates`,
      `Integrate deployment validation and rolling update checks into the CI/CD pipeline`
    ];
    acceptanceCriteria = `Workload deploys cleanly, passes health checks on port 5050, and operates with zero manual intervention.`;
  } else if (isBug) {
    summary = `Isolate root cause, implement a verified code patch, and establish regression guards for "${title}" to restore platform stability.`;
    steps = [
      `Reproduce defect locally with isolated test fixtures and inspect stack traces`,
      `Identify underlying failure mechanism across application logic and dependencies`,
      `Implement minimal, clean code remediation conforming to security standards`,
      `Execute full regression test suite (25 tests) and verify zero side-effects`
    ];
    acceptanceCriteria = `Defect is fully resolved, all regression tests pass with 100% success rate, and patch is staged for release.`;
  } else if (isTest) {
    summary = `Establish comprehensive, automated test coverage for "${title}" to guarantee behavioral correctness and prevent regressions.`;
    steps = [
      `Define positive, negative, and edge-case test specifications for target modules`,
      `Implement isolated unit and integration test fixtures using mocks where appropriate`,
      `Validate assertion coverage across asynchronous flows and error boundaries`,
      `Confirm 100% test pass rate in CI/CD pipeline and local test runs`
    ];
    acceptanceCriteria = `All test suites pass cleanly with verifiable assertion coverage and zero flaky tests.`;
  } else if (isUI) {
    summary = `Design, build, and polish user interface components for "${title}" with responsive glassmorphism styling, accessibility, and smooth interactions.`;
    steps = [
      `Implement markup structure, responsive layout, and dark-theme glassmorphism styles`,
      `Connect dynamic data binding and asynchronous API handlers`,
      `Verify cross-browser responsiveness on mobile, tablet, and desktop viewports`,
      `Test accessibility, keyboard focus states, and toast notification feedback`
    ];
    acceptanceCriteria = `UI components render cleanly, provide real-time visual feedback, and deliver a frictionless user experience.`;
  } else {
    summary = `Execute end-to-end delivery of "${title}" with focused technical precision, high user experience standards, and strict quality verification.`;
    steps = [
      `Define functional scope, target deliverables, and architectural prerequisites`,
      `Execute primary implementation in structured, modular milestones`,
      `Conduct comprehensive verification, edge-case testing, and error handling checks`,
      `Document technical changes, record usage notes, and mark milestone complete`
    ];
    acceptanceCriteria = `Deliverable fulfills all defined functional requirements and passes technical verification.`;
  }

  return `### 🎯 Objective\n${summary}\n\n### 📋 Actionable Checklist\n${steps.map(s => `- [ ] ${s}`).join('\n')}\n\n### ✅ Acceptance Criteria\n${acceptanceCriteria}\n\n*Priority:* **${priority}** | *Status:* **${status}** | *Target Due:* **${dueDate || 'Flexible'}**`;
}

/**
 * 2. Natural Language Task Parser: Extract structured task details with rich description, difficulty, and dates
 */
async function parseNaturalLanguageTask(options) {
  const text = typeof options === 'string' ? options : (options.text || '');
  const userDifficulty = typeof options === 'object' ? options.difficulty : null;
  const userDueDate = typeof options === 'object' ? options.dueDate : null;

  const ai = getGenAIClient();

  if (!ai) {
    return getMockNaturalLanguageParse({ text, difficulty: userDifficulty, dueDate: userDueDate });
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const prompt = `You are an elite agile engineering lead and productivity architect.
The user wants to schedule a task from this raw input: "${text}"
${userDifficulty && userDifficulty !== 'Auto' ? `User requested difficulty/priority: ${userDifficulty}` : ''}
${userDueDate ? `User requested due date: ${userDueDate}` : ''}
Today's Date: ${todayStr}

CRITICAL RULES:
1. Title: Crisp, clear action title (e.g. "Submit the Capstone Project" or "Configure Multi-Stage Docker Build").
   IMPORTANT: You MUST REMOVE scheduling words (e.g. "tomorrow", "tomarrow", "today", "by Friday"), priority keywords ("priority high", "high priority", "urgent"), and status keywords ("in progress", "doing", "pending", "completed") from the title. NEVER include "priority high" or "in progress" in the title!
2. Description: Do NOT write a trivial one-liner or merely repeat the raw input. Write an expert, structured Markdown description with:
   - ### 🎯 Objective: 1-2 sentence executive summary of the true deliverable and value.
   - ### 📋 Actionable Checklist: (- [ ] Step 1..., - [ ] Step 2..., - [ ] Step 3..., - [ ] Step 4...).
   - ### ✅ Acceptance Criteria: Clear condition for successful sign-off.
3. Priority: "High" | "Medium" | "Low". (Extract from input like "priority high", "urgent", or user difficulty).
4. Status: "Pending" | "In Progress" | "Completed" (Extract from input like "in progress", "wip", "completed". Default: "Pending").
5. Due Date: YYYY-MM-DD. (Calculate tomorrow/relative dates accurately based on Today: ${todayStr}).

Respond ONLY with valid JSON (no markdown formatting, no code fences):
{
  "title": "Clean Action Title",
  "description": "Rich structured markdown description with objective, checklist, and criteria",
  "priority": "High | Medium | Low",
  "status": "In Progress | Pending | Completed",
  "dueDate": "YYYY-MM-DD"
}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text ? response.text.trim() : '';
    const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    // Ensure title is strictly cleaned of metadata
    if (parsed.title) {
      parsed.title = cleanTaskTitle(parsed.title);
    }
    return parsed;
  } catch (err) {
    console.warn(`[GeminiService] Live API call failed (${err.message}). Using fallback parser.`);
    return getMockNaturalLanguageParse({ text, difficulty: userDifficulty, dueDate: userDueDate });
  }
}

/**
 * 3. Daily Focus Briefing: Summarize active tasks into a prioritized morning standup
 */
async function generateDailyBriefing(tasks = [], username = 'Developer') {
  const ai = getGenAIClient();

  if (!ai) {
    return getMockDailyBriefing(tasks, username);
  }

  const taskSummary = tasks.map((t, idx) => 
    `${idx + 1}. [${t.priority.toUpperCase()}] "${t.title}" (Status: ${t.status}, Due: ${t.dueDate ? t.dueDate.split('T')[0] : 'None'})`
  ).join('\n');

  const prompt = `You are an executive productivity coach conducting a daily morning standup briefing for ${username}.
Here are their current tasks:
${taskSummary || 'No active tasks at the moment.'}

Provide an inspiring, laser-focused daily plan.
Respond ONLY with valid JSON (no markdown formatting, no code fences):
{
  "greeting": "Warm greeting addressing ${username}",
  "headline": "Punchy 1-line theme for today",
  "topPriorities": [
    "Item 1: Crucial task to tackle first and why",
    "Item 2: Second priority",
    "Item 3: Third priority"
  ],
  "quickAdvice": "Actionable piece of productivity or engineering advice",
  "energyLevel": "High Focus | Steady Flow | High Urgency"
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text ? response.text.trim() : '';
    const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn(`[GeminiService] Live API call failed (${err.message}). Using fallback briefing.`);
    return getMockDailyBriefing(tasks, username);
  }
}

// ---------------------------------------------------------
// Intelligent Fallback Engines (Active when offline or without API Key)
// ---------------------------------------------------------

function getMockTaskBreakdown(title, description, priority) {
  const isCapstone = /capstone|thesis|dissertation|viva|rubric|faculty|submission|submit.*project|final.*project/i.test(title);
  const isDevOps = /docker|k8s|kubernetes|jenkins|pipeline|ci\/cd|terraform|ansible/i.test(title);
  const isBug = /fix|bug|error|issue|crash|patch/i.test(title);

  let subtasks = [];
  if (isCapstone) {
    subtasks = [
      'Synchronize git repository branches, clean up working tree, and tag production release',
      'Execute automated test suites (Jest/Supertest) and verify zero failing assertions',
      'Compile capstone project report, architecture diagrams, and milestone delivery summaries',
      'Dry-run live demonstration script covering REST API, AI features, Docker, and Kubernetes',
      'Package and submit project artifacts through the official evaluation portal'
    ];
  } else if (isDevOps) {
    subtasks = [
      'Define requirements, architecture, and environment configurations',
      'Create and test local configuration / manifests',
      'Integrate automated checks into the deployment pipeline',
      'Perform sanity testing and verify health check endpoints'
    ];
  } else if (isBug) {
    subtasks = [
      'Reproduce the issue locally with a failing test case',
      'Trace root cause in application logs and stack traces',
      'Implement the code patch and verify edge cases',
      'Run complete test suite and deploy fix'
    ];
  } else {
    subtasks = [
      'Clarify scope, objectives, and acceptance criteria',
      'Execute core implementation in focused intervals',
      'Review output against requirements and verify quality',
      'Mark deliverable complete and document key notes'
    ];
  }

  const cleanTitle = cleanTaskTitle(title);

  return {
    enhancedTitle: cleanTitle,
    summary: description && description.trim() 
      ? `Streamlined execution plan for "${cleanTitle}": ${description.slice(0, 100)}`
      : `High-impact execution breakdown for "${cleanTitle}" to ensure efficient delivery.`,
    suggestedPriority: priority || (isBug ? 'High' : 'Medium'),
    subtasks,
    estimatedTime: isCapstone ? '3-5 hours' : (isDevOps ? '2-4 hours' : (isBug ? '1-2 hours' : '1-3 hours')),
    acceptanceCriteria: `All subtasks are validated and functional without open regressions.`,
    proTip: `Group dependent items together and verify progress using your TaskFlow dashboard. (Simulated AI mode: add GEMINI_API_KEY in .env for live Gemini 2.5)`
  };
}

function getMockNaturalLanguageParse(input) {
  const text = typeof input === 'string' ? input : (input.text || '');
  const userDifficulty = typeof input === 'object' && input.difficulty ? input.difficulty : null;
  const userDueDate = typeof input === 'object' && input.dueDate ? input.dueDate : null;

  let raw = text.trim();

  // Normalize common typos and shortcuts before token extraction
  const normalized = raw
    .replace(/\b(tom+ar+ow|tom+or+ow|tom+or+o|tmrw|tmw)\b/gi, 'tomorrow')
    .replace(/\b(todai|2day)\b/gi, 'today')
    .replace(/\b(priorty|prio)\b/gi, 'priority')
    .replace(/\b(progres+|in-progress)\b/gi, 'in progress')
    .replace(/\b(pend?ing)\b/gi, 'pending')
    .replace(/\b(compl?eted?)\b/gi, 'completed');

  // 1. Difficulty / Priority determination
  let priority = userDifficulty && userDifficulty !== 'Auto' ? userDifficulty : 'Medium';
  if (!userDifficulty || userDifficulty === 'Auto') {
    if (/\b(?:priority\s*:?\s*(high|critical|urgent)|(high|critical|urgent)\s*priority)\b/i.test(normalized) ||
        /\b(urgent|critical|emergency|p0|p1)\b/i.test(normalized) ||
        /\b(k8s|kubernetes|cluster|prod|production|security|capstone)\b/i.test(normalized)) {
      priority = 'High';
    } else if (/\b(?:priority\s*:?\s*(low|minor)|(low|minor)\s*priority)\b/i.test(normalized) ||
               /\b(low|trivial|minor|whenever|readme|docs|comment|p3)\b/i.test(normalized)) {
      priority = 'Low';
    } else {
      priority = 'Medium';
    }
  }

  // 2. Status determination
  let status = 'Pending';
  if (/\b(?:status\s*:?\s*)?(in[- ]progress|in progress|wip|doing|working on|actively working|started)\b/i.test(normalized)) {
    status = 'In Progress';
  } else if (/\b(?:status\s*:?\s*)?(completed|done|finished|resolved)\b/i.test(normalized)) {
    status = 'Completed';
  }

  // 3. Due Date determination
  let dueDate = userDueDate || null;
  const today = new Date();
  if (!dueDate) {
    if (/\b(today|tonight|eod|end of day)\b/i.test(normalized)) {
      dueDate = today.toISOString().split('T')[0];
    } else if (/\btomorrow\b/i.test(normalized)) {
      const tmrw = new Date(today);
      tmrw.setDate(tmrw.getDate() + 1);
      dueDate = tmrw.toISOString().split('T')[0];
    } else if (/\bday after tomorrow\b/i.test(normalized)) {
      const dayAfter = new Date(today);
      dayAfter.setDate(dayAfter.getDate() + 2);
      dueDate = dayAfter.toISOString().split('T')[0];
    } else if (/\b(?:by|on)?\s*friday\b/i.test(normalized)) {
      const fri = new Date(today);
      const day = fri.getDay();
      const diff = (5 - day + 7) % 7 || 7;
      fri.setDate(fri.getDate() + diff);
      dueDate = fri.toISOString().split('T')[0];
    } else if (/\b(?:by|on)?\s*monday\b/i.test(normalized)) {
      const mon = new Date(today);
      const day = mon.getDay();
      const diff = (1 - day + 7) % 7 || 7;
      mon.setDate(mon.getDate() + diff);
      dueDate = mon.toISOString().split('T')[0];
    } else {
      // Smart default based on priority: High = +1 day, Medium = +3 days, Low = +5 days
      const daysToAdd = priority === 'High' ? 1 : (priority === 'Medium' ? 3 : 5);
      const defaultDate = new Date(today);
      defaultDate.setDate(defaultDate.getDate() + daysToAdd);
      dueDate = defaultDate.toISOString().split('T')[0];
    }
  }

  // 4. Clean Action Title (extract clean title, stripping out priority, status, and date tokens)
  const title = cleanTaskTitle(raw);

  // 5. Generate high-quality objective, checklist, and acceptance criteria
  const formattedDescription = generateBestObjectiveAndChecklist(title, priority, dueDate, status);

  return {
    title,
    description: formattedDescription,
    priority,
    status,
    dueDate
  };
}

function getMockDailyBriefing(tasks = [], username = 'Developer') {
  const highPriority = tasks.filter(t => t.priority === 'High' && t.status !== 'Completed');
  const pending = tasks.filter(t => t.status === 'Pending');
  const inProgress = tasks.filter(t => t.status === 'In Progress');

  const topPriorities = [];
  if (highPriority.length > 0) {
    topPriorities.push(`⚡ High Priority: Focus on "${highPriority[0].title}" first.`);
  }
  if (inProgress.length > 0) {
    topPriorities.push(`🔄 In Progress: Push "${inProgress[0].title}" across the finish line.`);
  }
  if (pending.length > 0) {
    topPriorities.push(`📋 Plan ahead: Review "${pending[0].title}" before starting your next sprint.`);
  }
  if (topPriorities.length === 0) {
    topPriorities.push('✨ Great job! All current high-priority tasks are completed or organized.');
  }

  return {
    greeting: `Hello, ${username}! Here is your AI Daily Focus Plan.`,
    headline: highPriority.length > 0 ? 'Target High-Impact Deliverables First' : 'Maintain Steady Velocity & Momentum',
    topPriorities,
    quickAdvice: 'Work in 45-minute focused blocks. Tackle urgent tasks before checking emails or alerts.',
    energyLevel: highPriority.length > 0 ? 'High Urgency' : 'Steady Flow'
  };
}

module.exports = {
  breakdownTask,
  parseNaturalLanguageTask,
  generateDailyBriefing
};
