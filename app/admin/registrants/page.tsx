import { getRegistrantsCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import type { Registrant } from "@/lib/types";

export const dynamic = 'force-dynamic';

async function getTodayRegistrants(): Promise<Registrant[]> {
  const collection = await getRegistrantsCollection();
  const date = getTodayDateString();

  const docs = await collection
    .find({ date })
    .sort({ enteredAt: 1 }) // earliest first
    .toArray();

  return docs;
}

export default async function RegistrantsAdminPage() {
  const registrants = await getTodayRegistrants();

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">
        Today&apos;s Registrants ({registrants.length})
      </h1>

      {registrants.length === 0 ? (
        <p>No registrations yet today.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Name</th>
              <th className="text-left py-2">Email</th>
              <th className="text-left py-2">Time Entered</th>
            </tr>
          </thead>
          <tbody>
            {registrants.map((r) => (
              <tr key={r._id?.toString()} className="border-b">
                <td className="py-2">{r.name}</td>
                <td className="py-2">{r.email}</td>
                <td className="py-2">
                  {new Date(r.enteredAt).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}