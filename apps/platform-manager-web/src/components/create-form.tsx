'use client';

import { useActionState } from 'react';
import { createPlatform } from '@/actions/platforms';

export function CreateForm() {
  const [error, action, pending] = useActionState(createPlatform, null);

  return (
    <form action={action} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
            Slug <span className="text-red-500">*</span>
          </label>
          <input
            id="slug" name="slug" type="text" required
            placeholder="citrus"
            pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            minLength={2} maxLength={50}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500">Must match the folder name in platforms/. Run create-client-platform skill first.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
            Display Name
          </label>
          <input
            id="displayName" name="displayName" type="text"
            placeholder="Citrus Pay"
            maxLength={50}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="domain" className="block text-sm font-medium text-gray-700">
            Domain
          </label>
          <input
            id="domain" name="domain" type="text"
            placeholder="citrus.pay"
            maxLength={100}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500">Defaults to &lt;slug&gt;.pay</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit" disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {pending ? 'Submitting…' : 'Deploy Platform'}
        </button>
        <a href="/platforms"
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  );
}
