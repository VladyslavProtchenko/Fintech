import { CreateForm } from '@/components/create-form';

export default function NewPlatformPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">New Platform</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Deploy a pre-generated platform. Run the <code className="bg-gray-100 px-1 rounded">create-client-platform</code> skill first
          to generate files in <code className="bg-gray-100 px-1 rounded">platforms/&lt;slug&gt;/</code>.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <CreateForm />
      </div>
    </div>
  );
}
