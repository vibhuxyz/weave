export interface PersonaDraft {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly skills: readonly string[];
  readonly character: string;
}
