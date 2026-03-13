# ChatGPT to Markdown

Extensão para Chrome (Manifest V3) que exporta conversas do [ChatGPT](https://chat.openai.com) para arquivos Markdown (.md) no seu computador.

## Como instalar (modo desenvolvedor)

1. Abra o Chrome e acesse `chrome://extensions/`.
2. Ative **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta do projeto (`gptextract`).

A extensão passará a aparecer na lista e estará ativa em `chat.openai.com`.

## Como usar

1. Abra [chat.openai.com](https://chat.openai.com) e entre em uma conversa (nova ou existente).
2. Na página da conversa, aparecerá o botão **"Exportar para Markdown"** no topo do conteúdo.
3. Clique no botão. O navegador fará o download de um arquivo `.md` com o nome no formato `chatgpt-AAAA-MM-DD-HHmm.md`.
4. Escolha a pasta em que deseja salvar (por exemplo, uma pasta local para suas transcrições).

O arquivo conterá a conversa formatada em Markdown: título, data da exportação, e cada mensagem com o cabeçalho **User** ou **Assistant** e o conteúdo (incluindo blocos de código quando existirem).

## Estrutura do projeto

```
gptextract/
├── manifest.json           # Manifest V3 da extensão
├── src/
│   ├── content/
│   │   ├── content.js      # Injeção do botão e fluxo de download
│   │   ├── extract.js      # Leitura do DOM da conversa
│   │   └── toMarkdown.js   # Conversão para texto Markdown
│   └── styles/
│       └── content.css     # Estilo do botão
├── icons/                  # Ícones 16, 48 e 128 px
└── README.md
```

## Manutenção

O ChatGPT pode alterar a estrutura do site (classes, atributos, layout). Se o botão deixar de aparecer ou a exportação parar de trazer o conteúdo correto, será necessário atualizar os **seletores** em `src/content/extract.js`. Os seletores atuais estão documentados no próprio arquivo e usam, quando possível, o atributo `data-message-author-role`, que tende a ser mais estável.

## Ícones

Os ícones em `icons/` são placeholders. Para personalizar, substitua `icon16.png`, `icon48.png` e `icon128.png` por imagens PNG nas dimensões indicadas. Você pode gerar ícones novamente com:

```bash
node scripts/create-icons.js
```

(Isso recria os ícones padrão atuais.)

## Licença

Uso livre para fins pessoais e de estudo.
