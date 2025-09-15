# Contributing Guidelines

## Branch Structure
- `MAIN` - Production-ready code
- `DEV` - Development branch where features are integrated
- Feature branches - Individual task branches

## Workflow Process

### 1. Task Selection
1. Check TODO.md for available tasks
2. Assign yourself to a task by adding your name in TODO.md
3. Create a GitHub issue for the task
4. Create a feature branch from `DEV`

### 2. Branch Naming Convention
```
feature/[task-name]-[username]
Example: feature/user-auth-john
```

### 3. Development Process
1. Always start by pulling the latest `DEV` branch
2. Create your feature branch
3. Make regular, meaningful commits
4. Keep your branch up to date with `DEV`
5. Write clear commit messages

### 4. Pull Request Process
1. Create a PR to merge your feature branch into `DEV`
2. Link the related GitHub issue
3. Get at least one code review
4. Address review comments
5. Merge only when approved

### 5. Code Review Guidelines
- Review code for functionality
- Check for potential conflicts
- Verify code style and best practices
- Test the changes locally if possible

### 6. Conflict Prevention
- Regularly sync with `DEV` branch
- Communicate with team about overlapping work
- Keep PRs focused and manageable
- Update TODO.md with your progress

### 7. Best Practices
- Never commit directly to `DEV` or `MAIN`
- Keep feature branches short-lived
- Document significant changes
- Write meaningful commit messages
- Test thoroughly before creating PR
