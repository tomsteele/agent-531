import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';
import type { Template, WeekPlan, SetPrescription, TemplateType } from '../types';

const TEMPLATES_DIR = join(import.meta.dir, '../../templates');

export function parseTemplate(filename: string): Template {
  const filepath = join(TEMPLATES_DIR, `${filename}.md`);
  const content = readFileSync(filepath, 'utf-8');
  return parseTemplateContent(content, filename);
}

export function getAllTemplates(): Template[] {
  const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.md'));
  return files.map(f => parseTemplate(f.replace('.md', '')));
}

function parseTemplateContent(content: string, name: string): Template {
  const tokens = marked.lexer(content);

  let displayName = name;
  let type: TemplateType = 'leader';
  let tmPercentage = 90;
  let leaderCycles: string | undefined;
  let pairedAnchor: string | undefined;
  let pairedLeader: string | undefined;
  const mainWork: WeekPlan[] = [];
  const supplemental: WeekPlan[] = [];

  let currentSection: 'none' | 'meta' | 'main' | 'supplemental' = 'none';
  let currentWeeks: number[] = [];
  let currentSets: SetPrescription[] = [];

  for (const token of tokens) {
    if (token.type === 'heading') {
      if (token.depth === 1) {
        displayName = token.text;
      } else if (token.depth === 2) {
        // Flush before switching sections
        if (currentSection === 'main' || currentSection === 'supplemental') {
          flushWeekPlan(currentWeeks, currentSets, currentSection === 'main' ? mainWork : supplemental);
          currentWeeks = [];
          currentSets = [];
        }

        switch (token.text.toLowerCase()) {
          case 'meta':
            currentSection = 'meta';
            break;
          case 'main work':
            currentSection = 'main';
            break;
          case 'supplemental':
            currentSection = 'supplemental';
            break;
        }
      } else if (token.depth === 3 && (currentSection === 'main' || currentSection === 'supplemental')) {
        flushWeekPlan(currentWeeks, currentSets, currentSection === 'main' ? mainWork : supplemental);
        currentWeeks = parseWeekHeader(token.text);
        currentSets = [];
      }
    } else if (token.type === 'list') {
      if (currentSection === 'meta') {
        for (const item of token.items) {
          const meta = parseMetaItem(item.text);
          if (!meta) continue;
          switch (meta.key) {
            case 'type':
              type = meta.value.toLowerCase() as TemplateType;
              break;
            case 'tm percentage':
            case 'tm%':
              tmPercentage = parseInt(meta.value.replace('%', ''), 10);
              break;
            case 'leader cycles':
              leaderCycles = meta.value;
              break;
            case 'anchor':
            case 'paired anchor':
              pairedAnchor = meta.value;
              break;
            case 'leader':
            case 'paired leader':
              pairedLeader = meta.value;
              break;
          }
        }
      } else if (currentSection === 'main' || currentSection === 'supplemental') {
        for (const item of token.items) {
          const set = parseSetLine(item.text);
          if (set) currentSets.push(set);
        }
      }
    }
  }

  // Flush remaining
  if (currentSection === 'main' || currentSection === 'supplemental') {
    flushWeekPlan(currentWeeks, currentSets, currentSection === 'main' ? mainWork : supplemental);
  }

  return { name, displayName, type, tmPercentage, leaderCycles, pairedAnchor, pairedLeader, mainWork, supplemental: supplemental.length > 0 ? supplemental : undefined };
}

function parseMetaItem(text: string): { key: string; value: string } | null {
  const colonIdx = text.indexOf(':');
  if (colonIdx === -1) return null;
  return { key: text.slice(0, colonIdx).trim().toLowerCase(), value: text.slice(colonIdx + 1).trim() };
}

function flushWeekPlan(weeks: number[], sets: SetPrescription[], target: WeekPlan[]): void {
  if (weeks.length > 0 && sets.length > 0) {
    target.push({ weeks: [...weeks], sets: [...sets] });
  }
}

function parseWeekHeader(line: string): number[] {
  // "Weeks 1-3" → [1, 2, 3]
  // "Week 1" → [1]
  const rangeMatch = line.match(/Weeks?\s+(\d+)\s*-\s*(\d+)/i);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    const weeks: number[] = [];
    for (let i = start; i <= end; i++) weeks.push(i);
    return weeks;
  }
  const singleMatch = line.match(/Week\s+(\d+)/i);
  if (singleMatch) {
    return [parseInt(singleMatch[1], 10)];
  }
  return [];
}

function parseSetLine(line: string): SetPrescription | null {
  // "5x5 FSL" → sets: 5, reps: "5", type: "FSL"
  // "10x5 FSL" → sets: 10, reps: "5", type: "FSL"
  const fslMatch = line.match(/^(\d+)x(\d+)\s+FSL$/i);
  if (fslMatch) {
    return {
      percentage: 0, // resolved at runtime from first main work set
      reps: fslMatch[2],
      sets: parseInt(fslMatch[1], 10),
      type: 'FSL',
    };
  }

  // "85% x 5+" → percentage: 85, reps: "5+"
  // "85% x 5" → percentage: 85, reps: "5"
  // "90% x 1-3" → percentage: 90, reps: "1-3"
  // "85% x PR" → percentage: 85, reps: "PR"
  const percentMatch = line.match(/^(\d+)%\s*x\s*(.+)$/);
  if (percentMatch) {
    return {
      percentage: parseInt(percentMatch[1], 10),
      reps: percentMatch[2].trim(),
    };
  }

  return null;
}

export function getWeekSets(template: Template, week: number, section: 'main' | 'supplemental'): SetPrescription[] {
  const plans = section === 'main' ? template.mainWork : (template.supplemental ?? []);
  for (const plan of plans) {
    if (plan.weeks.includes(week)) {
      return plan.sets;
    }
  }
  return [];
}
