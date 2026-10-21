export class FormatCodeDto {
  code: string;
  language: 'typescript' | 'python' | 'java' | 'cpp' | 'rust' | 'go';
}
