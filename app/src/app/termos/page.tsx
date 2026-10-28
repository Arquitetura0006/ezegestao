import type { Metadata } from "next";
import Documento from "../Documento";

export const metadata: Metadata = { title: "Termos de uso · EZE Gestão" };

export default function Termos() {
  return (
    <Documento
      titulo="Termos de uso"
      atualizado="28 de outubro de 2026"
      secoes={[
        {
          t: "Uso do sistema",
          p: [
            "O EZE Gestão é de uso restrito da equipe, dos Partners e dos clientes da EZE Arquitetura e Gestão. O acesso de cada pessoa é liberado pelo administrador do escritório.",
            "Cada pessoa é responsável pelo uso da própria conta e não deve compartilhar o acesso.",
          ],
        },
        {
          t: "Conteúdo",
          p: [
            "Os treinamentos, padrões, manuais e projetos disponíveis no sistema são de propriedade da EZE Arquitetura e Gestão ou de seus clientes, e não podem ser copiados ou divulgados sem autorização.",
          ],
        },
        {
          t: "Disponibilidade",
          p: [
            "O sistema está em evolução contínua. Funções podem mudar ou ficar temporariamente indisponíveis durante atualizações.",
          ],
        },
        {
          t: "Contato",
          p: ["Dúvidas: ezequiel@ezearquitetura.com.br."],
        },
      ]}
    />
  );
}
