import type { Task } from '../../../types/models';

type ProjectsViewProps = {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
};

export const ProjectsView = ({
  tasks,
  isLoading,
  error,
}: ProjectsViewProps): JSX.Element => {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading projects...</p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}

        {!isLoading && tasks.length === 0 ? (
          <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-border bg-card/40">
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          </div>
        ) : null}

        {tasks.length > 0 ? (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="rounded-lg border border-border bg-card/60 px-3 py-2"
              >
                <p className="text-sm text-foreground">{task.title}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
};
