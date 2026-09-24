export function FieldLabel({
  title,
  description,
  isRequired,
}: {
  title: string;
  description: string | null;
  isRequired: boolean;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium text-agent-text text-xs">
        {title}
        {isRequired && (
          <span className="ml-0.5 text-agent-warn" aria-label="required">
            *
          </span>
        )}
      </span>
      {description && <span className="text-agent-text-muted text-xs">{description}</span>}
    </span>
  );
}
