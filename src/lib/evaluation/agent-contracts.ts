import { z } from 'zod';

export const MAX_AGENT_STEPS = 5;
export const TOTAL_AGENT_TIMEOUT_MS = 30000;
export const AGENT_TOOL_NAMES = ['getGaps', 'getRecommendations', 'findEmployees', 'getSkillCoverage', 'getCatalogGaps', 'simulate'] as const;
export const AGENT_METRICS = ['currentLevel', 'requiredLevel', 'gap', 'criticalGap', 'readiness', 'projectedReadiness', 'score', 'rank', 'employeeCount', 'coverage', 'catalogGap', 'gain', 'match', 'roleMatch', 'gradeMatch', 'returnedCount', 'eligibleCount', 'requiredEmployeeCount', 'noTargetCount', 'uncoveredCount', 'coveredCount', 'criticalCount', 'hasTarget'] as const;

/** Dataset IDs, never profile names, role labels, descriptions or history records. */
export const agentEntityIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/);
const callId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const factId = z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/);
const evidenceId = z.string().regex(/^tool:[1-5]:(getGaps|getRecommendations|findEmployees|getSkillCoverage|getCatalogGaps|simulate)$/);
const employeeArgs = z.object({ employeeId: agentEntityIdSchema }).strict();
const findArgs = z.object({ roleId: agentEntityIdSchema.optional(), grade: z.enum(['Junior', 'Middle', 'Senior', 'Lead']).optional(), skillId: agentEntityIdSchema.optional(), minLevel: z.number().finite().min(0).max(5).optional() }).strict().superRefine((args, ctx) => {
  if (args.minLevel !== undefined && args.skillId === undefined) ctx.addIssue({ code: 'custom', message: 'minLevel requires skillId' });
});
/** One source for runtime validation and the provider's generated JSON Schema. */
export const AGENT_TOOL_ARGUMENT_SCHEMAS = {
  getGaps: employeeArgs,
  getRecommendations: employeeArgs,
  findEmployees: findArgs,
  getSkillCoverage: z.object({ skillId: agentEntityIdSchema }).strict(),
  getCatalogGaps: z.object({}).strict(),
  simulate: z.object({ employeeId: agentEntityIdSchema, activityId: agentEntityIdSchema }).strict(),
} as const;
export const agentToolCallSchema = z.discriminatedUnion('name', [
  z.object({ id: callId, name: z.literal('getGaps'), arguments: AGENT_TOOL_ARGUMENT_SCHEMAS.getGaps }).strict(),
  z.object({ id: callId, name: z.literal('getRecommendations'), arguments: AGENT_TOOL_ARGUMENT_SCHEMAS.getRecommendations }).strict(),
  z.object({ id: callId, name: z.literal('findEmployees'), arguments: AGENT_TOOL_ARGUMENT_SCHEMAS.findEmployees }).strict(),
  z.object({ id: callId, name: z.literal('getSkillCoverage'), arguments: AGENT_TOOL_ARGUMENT_SCHEMAS.getSkillCoverage }).strict(),
  z.object({ id: callId, name: z.literal('getCatalogGaps'), arguments: AGENT_TOOL_ARGUMENT_SCHEMAS.getCatalogGaps }).strict(),
  z.object({ id: callId, name: z.literal('simulate'), arguments: AGENT_TOOL_ARGUMENT_SCHEMAS.simulate }).strict(),
]);

const factShape = {
  subjectId: agentEntityIdSchema,
  metric: z.enum(AGENT_METRICS), value: z.number().finite().min(0).max(1000000),
  skillId: agentEntityIdSchema.optional(), activityId: agentEntityIdSchema.optional(),
};
type NumericFact = { metric: typeof AGENT_METRICS[number]; value: number };
function validateValue(fact: NumericFact, ctx: z.RefinementCtx) {
  const max = ['currentLevel', 'requiredLevel', 'gap', 'criticalGap', 'gain'].includes(fact.metric) ? 5
    : ['readiness', 'projectedReadiness', 'score', 'coverage', 'match', 'roleMatch', 'gradeMatch', 'hasTarget'].includes(fact.metric) ? 1 : 1000000;
  if (fact.value > max) ctx.addIssue({ code: 'custom', message: 'Metric out of range' });
  if (!['currentLevel', 'requiredLevel', 'gap', 'criticalGap', 'gain', 'readiness', 'projectedReadiness', 'score', 'coverage'].includes(fact.metric) && !Number.isInteger(fact.value)) ctx.addIssue({ code: 'custom', message: 'Count or flag must be an integer' });
}
export const agentFactSchema = z.object({ id: factId, ...factShape }).strict().superRefine(validateValue);
export const agentClaimSchema = z.object({ evidenceId, factId, ...factShape }).strict().superRefine(validateValue);
export const agentToolResultSchema = z.object({
  callId, evidenceId, tool: z.enum(AGENT_TOOL_NAMES), facts: z.array(agentFactSchema).max(400),
}).strict().superRefine((result, ctx) => {
  if (!result.evidenceId.endsWith(`:${result.tool}`)) ctx.addIssue({ code: 'custom', message: 'Evidence tool mismatch' });
  if (new Set(result.facts.map(fact => fact.id)).size !== result.facts.length) ctx.addIssue({ code: 'custom', message: 'Duplicate fact ID' });
});
export const agentHistoryEntrySchema = z.object({ call: agentToolCallSchema, result: agentToolResultSchema }).strict().superRefine((entry, ctx) => {
  if (entry.call.id !== entry.result.callId || entry.call.name !== entry.result.tool) ctx.addIssue({ code: 'custom', message: 'Call/result mismatch' });
});
export const agentStepRequestSchema = z.object({
  language: z.enum(['ru', 'kk', 'en']), question: z.string().trim().min(1).max(1200),
  history: z.array(agentHistoryEntrySchema).max(MAX_AGENT_STEPS),
}).strict().superRefine((request, ctx) => {
  const ids = new Set<string>();
  request.history.forEach((entry, index) => {
    if (ids.has(entry.call.id)) ctx.addIssue({ code: 'custom', message: 'Repeated call ID' });
    ids.add(entry.call.id);
    if (entry.result.evidenceId !== `tool:${index + 1}:${entry.call.name}`) ctx.addIssue({ code: 'custom', message: 'Invalid evidence sequence' });
  });
});
export const agentClaimsSchema = z.object({ claims: z.array(agentClaimSchema).max(40) }).strict();
export const agentAnswerSchema = agentClaimsSchema.extend({ text: z.string().trim().min(1).max(6000) }).strict();
export const agentStepResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('tools'), calls: z.array(agentToolCallSchema).length(1) }).strict(),
  z.object({ status: z.literal('answer'), claims: z.array(agentClaimSchema).max(40), text: z.string().min(1).max(6000) }).strict(),
  z.object({ status: z.literal('no_key'), reason: z.string().max(100) }).strict(),
  z.object({ status: z.literal('blocked'), reason: z.string().max(100) }).strict(),
  z.object({ status: z.literal('timeout'), reason: z.string().max(100) }).strict(),
]);
export type AgentToolName = typeof AGENT_TOOL_NAMES[number];
export type AgentMetric = typeof AGENT_METRICS[number];
export type AgentToolCall = z.infer<typeof agentToolCallSchema>;
export type AgentFact = z.infer<typeof agentFactSchema>;
export type AgentClaim = z.infer<typeof agentClaimSchema>;
export type AgentToolResult = z.infer<typeof agentToolResultSchema>;
export type AgentHistoryEntry = z.infer<typeof agentHistoryEntrySchema>;
export type AgentStepRequest = z.infer<typeof agentStepRequestSchema>;
export type AgentStepResponse = z.infer<typeof agentStepResponseSchema>;
