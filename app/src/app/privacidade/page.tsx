import type { Metadata } from "next";
import Documento from "../Documento";

export const metadata: Metadata = { title: "Privacidade · EZE Gestão" };

export default function Privacidade() {
  return (
    <Documento
      titulo="Política de privacidade"
      atualizado="28 de outubro de 2026"
      secoes={[
        {
          t: "Quem somos",
          p: [
            "O EZE Gestão é o escritório virtual da EZE Arquitetura e Gestão, de Bombinhas, SC. Ele é usado pela equipe, pelos Partners e pelos clientes do escritório.",
            "Contato para assuntos de privacidade: ezequiel@ezearquitetura.com.br.",
          ],
        },
        {
          t: "Dados que coletamos",
          p: [
            "Ao entrar com Google ou com link por e-mail: nome, e-mail e foto do perfil. Não acessamos sua caixa de e-mail, contatos, agenda ou arquivos do Google.",
            "Durante o uso: progresso nas trilhas de treinamento, presença na sala virtual, recados, projetos e entregas em que você participa.",
            "Na recepção, clientes informam nome e assunto da visita.",
          ],
        },
        {
          t: "Para que usamos",
          p: [
            "Identificar quem entra, liberar o acesso de acordo com o papel de cada pessoa, organizar o trabalho e o treinamento, e registrar a comunicação entre a equipe e os clientes.",
            "Não vendemos nem compartilhamos dados pessoais para publicidade.",
          ],
        },
        {
          t: "Onde ficam os dados",
          p: [
            "Os dados ficam no Supabase (servidores em São Paulo) e o site é hospedado pela Vercel. O acesso é restrito por regras de segurança por escritório e por papel.",
          ],
        },
        {
          t: "Seus direitos (LGPD)",
          p: [
            "Você pode pedir a qualquer momento acesso, correção ou exclusão dos seus dados pelo e-mail acima. Respondemos em até 15 dias.",
          ],
        },
      ]}
    />
  );
}
