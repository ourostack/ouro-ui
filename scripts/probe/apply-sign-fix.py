import subprocess
fixed = subprocess.run(["git", "show", "origin/fix/chapter-one-sign-settle:site/e2e/chapter-one.spec.ts"], capture_output=True, text=True).stdout
probe = open("site/e2e/chapter-one.spec.ts").read()
a = fixed.index("async function pressSign"); b = fixed.index("\n}\n", a) + 3
helper = fixed[fixed.rindex("/**", 0, a):b]
probe = probe.replace('const signButton = (page: Page) => page.getByRole("button", { name: ARTICLES.sign });', 'const signButton = (page: Page) => page.getByRole("button", { name: ARTICLES.sign });\n' + helper, 1)
s0 = probe.index('test("control: sign with the name taken away again'); s1 = probe.index('test("control: leave takes you off')
probe = probe[:s0] + probe[s0:s1].replace("await signButton(page).click();", "await pressSign(page);") + probe[s1:]
open("site/e2e/chapter-one.spec.ts", "w").write(probe)
print("applied fix", probe.count("await pressSign(page);"))
