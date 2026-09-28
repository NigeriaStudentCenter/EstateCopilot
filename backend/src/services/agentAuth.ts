import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

// Agents sign in on the website with email + password (they're desk users
// sharing links all day, not the app's phone-OTP crowd).

export interface AgentTokenPayload {
  agentId: string;
  email: string;
}

export interface AgentAuthedRequest extends Request {
  agent?: AgentTokenPayload;
}

export function signAgentToken(payload: AgentTokenPayload): string {
  return jwt.sign(payload, env.agentAuth.jwtSecret, { expiresIn: '30d' });
}

export function verifyAgentToken(token: string): AgentTokenPayload {
  return jwt.verify(token, env.agentAuth.jwtSecret) as AgentTokenPayload;
}

export async function requireAgentAuth(req: AgentAuthedRequest, res: Response, next: NextFunction) {
  if (env.mockMode) return res.status(503).json({ error: 'The agent marketplace needs the database (not available in mock mode).' });
  const h = req.get('authorization');
  const token = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'Please sign in' });
  let payload: AgentTokenPayload;
  try {
    payload = verifyAgentToken(token);
  } catch {
    return res.status(401).json({ error: 'Your session has expired — please sign in again' });
  }
  if (!payload.agentId) return res.status(401).json({ error: 'Please sign in' });
  const agent = await prisma.agent.findUnique({ where: { id: payload.agentId }, select: { status: true } });
  if (!agent) return res.status(401).json({ error: 'Account not found' });
  if (agent.status !== 'ACTIVE') return res.status(403).json({ error: 'Your agent account is suspended. Contact support.' });
  req.agent = payload;
  next();
}

/** Short, unambiguous share code, e.g. "ADA7K2". */
export async function newAgentCode(name: string): Promise<string> {
  const prefix = name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 20; i++) {
    let suffix = '';
    for (let j = 0; j < 3; j++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    const code = prefix + suffix;
    if (!(await prisma.agent.findUnique({ where: { code } }))) return code;
  }
  throw new Error('Could not allocate an agent code');
}
