'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { registerAction } from '@/actions/auth';

export function RegisterForm() {
  const [error, action, pending] = useActionState(registerAction, null);

  return (
    <form action={action} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
          placeholder="Jane Doe"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
          placeholder="At least 8 characters"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 text-sm font-bold text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Creating account…' : 'Create Account'}
      </button>
      <p className="text-center text-sm text-gray-500">
        Have an account?{' '}
        <Link href="/login" className="text-green-600 font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
