import { setupIndexes, listIndexes } from "@/lib/setup-indexes";

/**
 * Admin page for one-time database setup.
 *
 * Visit this page ONCE to create all necessary indexes.
 * After indexes are created, you can delete this file or restrict access.
 */
export default async function SetupDatabasePage() {
  let setupResult = "";
  let indexList = "";
  let error = "";

  try {
    // Create all indexes
    const setupOutput: string[] = [];
    const originalLog = console.log;

    // Capture console.log output
    console.log = (...args: any[]) => {
      setupOutput.push(args.join(' '));
      originalLog(...args);
    };

    await setupIndexes();

    // Restore console.log
    console.log = originalLog;

    setupResult = setupOutput.join('\n');

    // List all indexes for verification
    const listOutput: string[] = [];
    console.log = (...args: any[]) => {
      listOutput.push(args.join(' '));
      originalLog(...args);
    };

    await listIndexes();

    console.log = originalLog;
    indexList = listOutput.join('\n');

  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error("Setup error:", err);
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Database Setup</h1>
        <p className="text-muted-foreground mb-8">
          One-time setup to create MongoDB indexes for optimal performance.
        </p>

        {error ? (
          <div className="bg-destructive/10 border border-destructive text-destructive rounded-lg p-4 mb-6">
            <h2 className="font-semibold mb-2">❌ Error</h2>
            <pre className="text-sm whitespace-pre-wrap">{error}</pre>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 mb-6">
            <h2 className="font-semibold mb-2">✅ Setup Complete</h2>
            <p className="text-sm">All database indexes have been created successfully!</p>
          </div>
        )}

        {setupResult && (
          <div className="bg-card border rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-3">Setup Output:</h2>
            <pre className="text-sm bg-muted p-4 rounded overflow-x-auto whitespace-pre">
              {setupResult}
            </pre>
          </div>
        )}

        {indexList && (
          <div className="bg-card border rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-3">Current Indexes:</h2>
            <pre className="text-sm bg-muted p-4 rounded overflow-x-auto whitespace-pre">
              {indexList}
            </pre>
          </div>
        )}

        <div className="bg-secondary/50 border rounded-lg p-6">
          <h3 className="font-semibold mb-2">Next Steps:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Verify that all indexes were created successfully above</li>
            <li>You can safely delete this page after setup is complete</li>
            <li>Or add authentication to restrict access to this page</li>
            <li>Check MongoDB Atlas UI to see the indexes visually</li>
          </ol>
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          <p><strong>Note:</strong> This page runs every time you visit it. Indexes are idempotent - running multiple times won't cause issues, but it's best to run once and then remove/protect this page.</p>
        </div>
      </div>
    </div>
  );
}
