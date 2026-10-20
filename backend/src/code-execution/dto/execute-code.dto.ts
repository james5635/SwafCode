export class ExecuteCodeDto {
  code: string;
  language: 'typescript' | 'python' | 'java' | 'cpp' | 'rust' | 'go';
}
