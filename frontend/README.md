# Frontend Envoxers

O login é independente da aplicação. index.html carrega somente React,
ReactDOM, CSS essencial, assets-runtime/login.js e runtime-boot.js.
Os demais 32 módulos JSX são pré-compilados em assets-runtime/app.js e
carregados somente após haver uma sessão.

## Após modificar qualquer frontend/public/tc-*.jsx

    cd /docker/envoxers/frontend
    npm ci
    npm run build
    npm run test:smoke

O build usa esbuild para transformar JSX (sem runtime Babel) e atualiza
assets-runtime/manifest.json e o hash de login.js em index.html.
O app.js é versionado dinamicamente via manifest.json.

Os arquivos gerados em public/assets-runtime DEVEM entrar no commit.
A lista e ordem de módulos está em public/module-order.json e deve ser
atualizada ao adicionar/remover tc-*.jsx.

runtime-boot.js e CSS de login não exigem esbuild. Ao alterá-los,
incremente a query ?v= em index.html para invalidar cache.

O registro do Service Worker novo e a ativação Push ocorrem somente no
dispositivo habitual. Login pelo navegador e acesso rápido dispensam instalação.
O Service Worker existente só armazena em cache recursos estáticos públicos,
nunca APIs, documentos ou dados dos usuários.

## Testes

npm run test:smoke verifica:
- Login com 3 modalidades, sem download do app.js nem Babel.
- Sessão autenticada busca o app.js e monta o AppShell.
- Ausência de erros no navegador simulado.

Validar também manualmente com conta autorizada: login normal, web e rápido,
vínculo QR/código, chat, arquivos e abertura de cards compartilhados.
