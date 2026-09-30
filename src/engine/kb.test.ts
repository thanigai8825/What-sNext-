import { describe, expect, it } from 'vitest'
import { analyzeProfile, EXTRACTION_PROMPT, focusLabel, groupSteps, listItems, looksLikePrompt, parseProfile } from './kb'

const NOW = new Date(2026, 8, 30, 10, 0, 0)

// What ChatGPT / Claude / Gemini return for the new prompt: one code block.
const NEW_FORMAT = `\`\`\`
GOALS:
- Land a product design role in Singapore by Oct 2026
- Grow freelance design income to ₹1L a month
- Build a house for my parents within a year
NEXT STEPS:
- Finish the fintech case study
- Send proposal to Arun by Friday
- Update portfolio website with two case studies
- Reach out to 5 founders on LinkedIn
- Save 30% of income every month
HIGH-VALUE WORK:
- Portfolio case studies that show business thinking
- Client proposals
I PUT OFF:
- Reaching out to potential clients
- Sales calls
BUSYWORK:
- Tweaking my portfolio website
- Checking email
FOCUS TIME:
- Best focus 8–11am; gym on Tue and Thu evenings
LIMITS:
- Full-time job, so about 2 hours a day for side work
ABOUT ME:
- Self-taught product designer, ~2 years experience
WORKING STYLE:
- Short focused sprints with breaks
\`\`\``

// A real answer to the old prompt: long run-on paragraphs with inline numbering.
const LEGACY = `GOALS: Build a strong product/UI/UX design career and reach 2 years of experience in October 2026; longer-term target is overseas opportunities, especially Singapore. 2) Build a freelance/solo-design business targeting higher-value founders and decision-makers, with a premium portfolio and consistent client acquisition. 3) Buy land and build a house for my parents within 1 year.
ROLE & PROJECTS: Self-taught UI/UX/Product Designer with ~2 years of experience by October 2026. Full-time office role, currently earning ₹40k/month.
HIGH-VALUE WORK: Product/UX work that demonstrates problem framing → research → solution → flows → UI → prototype. Building strong portfolio projects and case studies that show business thinking rather than just visual design.
AVOIDANCE PATTERNS: unknown
ENERGY & SCHEDULE: I focus best late at night after work.
CONSTRAINTS: unknown
WORKING STYLE: unknown`

describe('knowledge base import', () => {
  it('reads the one-code-block answer', () => {
    const fields = parseProfile(NEW_FORMAT)
    expect(fields.map((f) => f.key)).toEqual(['goals', 'nextSteps', 'highValue', 'avoidance', 'busywork', 'energy', 'constraints', 'role', 'style'])
    const a = analyzeProfile(fields, NOW)
    expect(a.goals.map((g) => g.title)).toEqual([
      'Land a product design role in Singapore',
      'Grow freelance design income to ₹1L a month',
      'Build a house for my parents',
    ])
    expect(a.goals[0].deadline).toMatch(/^2026-10/)
    expect(a.nextSteps).toHaveLength(5)
    expect(a.signals.avoid).toEqual(['reaching out to potential clients', 'sales calls'])
    expect(a.signals.busywork).toEqual(['tweaking my portfolio website', 'checking email'])
    expect(a.signals.highValue).toContain('portfolio case studies')
    expect(a.signals.peak).toEqual([8, 11])
  })

  it('turns long legacy paragraphs into short goals', () => {
    const a = analyzeProfile(parseProfile(LEGACY), NOW)
    expect(a.goals.map((g) => g.title)).toEqual([
      'Build a strong product/UI/UX design career',
      'Build a freelance/solo-design business',
      'Buy land and build a house for my parents',
    ])
    expect(a.goals[0].deadline).toMatch(/^2026-10/)
    expect(a.signals.peak).toEqual([21, 24])
  })

  it('does not split on years or amounts', () => {
    expect(listItems('Reach 2 years in 2026. Then move abroad')).toEqual(['Reach 2 years in 2026. Then move abroad'])
    expect(listItems('1) One thing 2) Another thing')).toEqual(['One thing', 'Another thing'])
    expect(listItems('Launch portfolio by Oct 30; land two clients')).toEqual(['Launch portfolio by Oct 30', 'land two clients'])
  })

  it('recognises the prompt pasted back by mistake', () => {
    expect(looksLikePrompt(EXTRACTION_PROMPT)).toBe(true)
    expect(parseProfile(EXTRACTION_PROMPT)).toEqual([])
  })

  it('groups next steps under the goal they serve', () => {
    const a = analyzeProfile(parseProfile(NEW_FORMAT), NOW)
    const { byGoal, other } = groupSteps(a.nextSteps, a.goals)
    expect(byGoal.flat().length + other.length).toBe(a.nextSteps.length)
    expect(byGoal[1]).toContain('Send proposal to Arun by Friday')
  })

  it('labels focus time in plain words', () => {
    expect(focusLabel([8, 11])).toBe('Mornings · 8–11 AM')
    expect(focusLabel([13, 17])).toBe('Afternoons · 1–5 PM')
    expect(focusLabel([21, 24])).toBe('Late nights · 9 PM–12 AM')
  })
})
