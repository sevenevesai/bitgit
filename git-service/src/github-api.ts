import { Octokit } from '@octokit/rest';

export class GitHubAPI {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async createRepository(name: string, isPrivate: boolean): Promise<string> {
    try {
      const response = await this.octokit.repos.createForAuthenticatedUser({
        name,
        private: isPrivate,
        auto_init: false,
      });

      return response.data.clone_url;
    } catch (error: any) {
      throw new Error(`Failed to create repository: ${error.message}`);
    }
  }

  async listBranches(owner: string, repo: string): Promise<string[]> {
    try {
      const response = await this.octokit.repos.listBranches({
        owner,
        repo,
      });

      return response.data
        .map((b) => b.name)
        .filter((name) => !['main', 'master'].includes(name));
    } catch (error: any) {
      throw new Error(`Failed to list branches: ${error.message}`);
    }
  }

  async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    try {
      await this.octokit.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
    } catch (error: any) {
      throw new Error(`Failed to delete branch: ${error.message}`);
    }
  }

  async verifyToken(): Promise<{ username: string; valid: boolean }> {
    try {
      const response = await this.octokit.users.getAuthenticated();
      return {
        username: response.data.login,
        valid: true,
      };
    } catch (error) {
      return {
        username: '',
        valid: false,
      };
    }
  }

  async listUserRepositories(): Promise<Array<{
    name: string;
    fullName: string;
    cloneUrl: string;
    htmlUrl: string;
    owner: string;
    isPrivate: boolean;
    defaultBranch: string;
  }>> {
    try {
      const response = await this.octokit.repos.listForAuthenticatedUser({
        per_page: 100,
        sort: 'updated',
      });

      return response.data.map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        cloneUrl: repo.clone_url,
        htmlUrl: repo.html_url,
        owner: repo.owner.login,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch || 'main',
      }));
    } catch (error: any) {
      throw new Error(`Failed to list repositories: ${error.message}`);
    }
  }
}
