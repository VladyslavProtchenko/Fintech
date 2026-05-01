'use client';

import { useActionState } from 'react';
import { registerAction } from '@/actions/auth';
import Link from 'next/link';

export default function RegisterForm() {
  const [error, formAction, pending] = useActionState(registerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="bg-primary-50 border border-primary-200 text-primary-800 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          placeholder="Yuki Tanaka"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 disabled:opacity-60 transition"
      >
        {pending ? 'Creating account…' : 'Create Account'}
      </button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="text-primary-700 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
