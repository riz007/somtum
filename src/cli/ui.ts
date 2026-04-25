const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

export const SOMTUM_LOGO = `
   ${GREEN}${BOLD}_____ ${RED}____  ${YELLOW}__  ${GREEN}__________  ${RED}__  ${YELLOW}___
  ${GREEN}/ ___/ ${RED}/ __ \\${YELLOW}/  |/  ${GREEN}/_  __/ / / ${RED}/  |/  ${YELLOW}/
  ${GREEN}\\__ \\ ${RED}/ / / /${YELLOW} /|_/ / ${GREEN}/ / / / / ${RED}/ /|_/ / ${YELLOW}
 ${GREEN}___/ / ${RED}/_/ / ${YELLOW}/  / / ${GREEN}/ / / /_/ / ${RED}/  / /  ${YELLOW}
${GREEN}/____/ ${RED}\\____/ ${YELLOW}/_/  /_/ ${GREEN}/_/  \\____/ ${RED}/_/  /_/   ${RESET}
                                          
   ${BOLD}${GREEN}Local-first memory for Claude Code${RESET}
`;

export function printLogo(): void {
  // Only print if we're in a TTY to avoid messing up pipes/logs
  if (process.stdout.isTTY) {
    console.log(SOMTUM_LOGO);
  }
}
