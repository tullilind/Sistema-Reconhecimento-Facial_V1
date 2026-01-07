// reconhecimentofacial.js
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { Canvas, Image, ImageData } = require('canvas');
const faceapi = require('face-api.js');

// === CONFIGURAÇÃO PARA RODAR NO NODE.JS (Sem Navegador) ===
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const app = express();
const PORT = 50005;

// === CHAVE DE AUTENTICAÇÃO DA API ===
const API_KEY = '1526105';

// === CONFIGURAÇÃO DE CORS (SOLUÇÃO DO ERRO) ===
app.use((req, res, next) => {
    // Permite requisições do seu domínio Netlify (e localhost para testes)
    const allowedOrigins = [
        'https://ornate-bublanina-ed2551.netlify.app',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://127.0.0.1:5500'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    // Permite os métodos HTTP necessários
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    // Permite os cabeçalhos necessários (incluindo x-api-key)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-API-Key');
    
    // Permite credenciais (se necessário)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Trata requisições OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Aumenta limite para aceitar fotos grandes em Base64
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// === MIDDLEWARE DE AUTENTICAÇÃO ===
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
    
    if (!apiKey) {
        return res.status(401).json({ 
            success: false, 
            message: "Chave API não fornecida. Use o cabeçalho 'x-api-key'." 
        });
    }
    
    if (apiKey !== API_KEY) {
        return res.status(403).json({ 
            success: false, 
            message: "Chave API inválida." 
        });
    }
    
    next();
}

// === BANCO DE DADOS (SQLite) ===
const dbPath = path.resolve(__dirname, 'biometria.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Erro ao conectar no banco:', err);
    else console.log('📁 Banco de dados conectado: biometria.sqlite');
});

// Cria tabela se não existir
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS pacientes (
            cpf TEXT PRIMARY KEY,
            nome TEXT,
            foto_base64 TEXT,
            descriptor TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// === CARREGAMENTO DA IA (CORRIGIDO) ===
async function loadModels() {
    console.log('🤖 Carregando modelos de IA das subpastas...');
    
    // Caminho base onde está a pasta "models"
    const modelsPath = path.join(__dirname, 'models');

    try {
        // 1. Carrega SSD MobileNet (Detecção)
        const ssdPath = path.join(modelsPath, 'ssd_mobilenetv1');
        if (!fs.existsSync(ssdPath)) {
            throw new Error(`Pasta não encontrada: ${ssdPath}`);
        }
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(ssdPath);
        console.log('   ✓ SSD MobileNet carregado.');

        // 2. Carrega Face Landmark 68 (Pontos do rosto)
        const landmarkPath = path.join(modelsPath, 'face_landmark_68');
        if (!fs.existsSync(landmarkPath)) {
            throw new Error(`Pasta não encontrada: ${landmarkPath}`);
        }
        await faceapi.nets.faceLandmark68Net.loadFromDisk(landmarkPath);
        console.log('   ✓ Face Landmark 68 carregado.');

        // 3. Carrega Face Recognition (Reconhecimento)
        const recognitionPath = path.join(modelsPath, 'face_recognition');
        if (!fs.existsSync(recognitionPath)) {
            throw new Error(`Pasta não encontrada: ${recognitionPath}`);
        }
        await faceapi.nets.faceRecognitionNet.loadFromDisk(recognitionPath);
        console.log('   ✓ Face Recognition carregado.');

        console.log('✅ TODOS OS MODELOS CARREGADOS COM SUCESSO!');
        return true;
    } catch (error) {
        console.error("❌ ERRO AO CARREGAR MODELOS:", error.message);
        console.error("\n📂 Estrutura esperada:");
        console.error("   models/");
        console.error("   ├── ssd_mobilenetv1/");
        console.error("   │   └── (arquivos .json e .bin)");
        console.error("   ├── face_landmark_68/");
        console.error("   │   └── (arquivos .json e .bin)");
        console.error("   └── face_recognition/");
        console.error("       └── (arquivos .json e .bin)");
        console.error("\n⚠️  Verifique se todos os arquivos dos modelos estão nas pastas corretas!");
        return false;
    }
}

// Função auxiliar para converter Base64 em Imagem para IA
async function loadImageFromBase64(base64String) {
    const base64Data = base64String.replace(/^data:image\/.*;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (err) => reject(err);
        image.src = buffer;
    });
    return img;
}

// === ROTAS DA API ===

// 0. Health Check (para testar se a API está online) - SEM AUTENTICAÇÃO
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: "API de Reconhecimento Facial está online!",
        timestamp: new Date().toISOString()
    });
});

// 1. Verificar Status (GET) - COM AUTENTICAÇÃO
app.get('/api/biometry/status/:cpf', requireApiKey, (req, res) => {
    const { cpf } = req.params;
    db.get("SELECT nome, criado_em FROM pacientes WHERE cpf = ?", [cpf], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        
        if (row) {
            res.json({ 
                success: true, 
                message: "Usuário possui biometria.", 
                data: { has_biometry: true, cpf, registered_at: row.criado_em } 
            });
        } else {
            res.json({ 
                success: true, 
                message: "Sem biometria cadastrada.", 
                data: { has_biometry: false, cpf } 
            });
        }
    });
});

// 2. Cadastrar Biometria (POST) - COM AUTENTICAÇÃO
app.post('/api/biometry/register', requireApiKey, async (req, res) => {
    try {
        const { cpf, nome, photo_base64 } = req.body;
        if (!cpf || !photo_base64) {
            return res.status(400).json({ success: false, message: "CPF e Foto são obrigatórios." });
        }

        console.log(`📸 Processando cadastro para CPF: ${cpf}...`);

        // 1. Carrega imagem
        const img = await loadImageFromBase64(photo_base64);

        // 2. Detecta rosto
        const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            return res.json({ 
                success: false, 
                message: "Nenhum rosto detectado.",
                data: { 
                    issues: ['no_face_detected'],
                    recommendations: ['Enquadre o rosto de frente', 'Melhore a iluminação']
                }
            });
        }

        // 3. Serializa o descritor
        const descriptorStr = JSON.stringify(Array.from(detection.descriptor));

        // 4. Salva no SQLite
        const stmt = db.prepare("INSERT OR REPLACE INTO pacientes (cpf, nome, foto_base64, descriptor) VALUES (?, ?, ?, ?)");
        stmt.run(cpf, nome || 'Paciente', photo_base64, descriptorStr, function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: "Erro no banco: " + err.message });
            }
            
            console.log(`✅ Biometria salva para CPF: ${cpf}`);
            res.json({ 
                success: true, 
                message: "Biometria cadastrada com sucesso!", 
                data: { cpf, quality_score: detection.detection.score } 
            });
        });
        stmt.finalize();

    } catch (error) {
        console.error("Erro no cadastro:", error);
        res.status(500).json({ success: false, message: "Erro interno: " + error.message });
    }
});

// 3. Validar Acesso (POST) - COM AUTENTICAÇÃO
app.post('/api/biometry/validate', requireApiKey, async (req, res) => {
    try {
        const { cpf, photo_base64 } = req.body;
        
        if (!cpf || !photo_base64) {
            return res.status(400).json({ success: false, message: "CPF e Foto são obrigatórios." });
        }
        
        console.log(`🔍 Validando acesso para CPF: ${cpf}...`);
        
        // 1. Busca usuário no banco
        db.get("SELECT descriptor FROM pacientes WHERE cpf = ?", [cpf], async (err, row) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Erro no banco de dados." });
            }
            if (!row) {
                return res.json({ success: false, message: "Biometria não encontrada para este CPF." });
            }

            try {
                // 2. Processa a nova foto
                const img = await loadImageFromBase64(photo_base64);
                const detection = await faceapi
                    .detectSingleFace(img)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (!detection) {
                    return res.json({ 
                        success: false, 
                        message: "Foto inválida para validação. Nenhum rosto detectado.",
                        data: { issues: ['no_face_detected'] }
                    });
                }

                // 3. Compara
                const storedDescriptor = new Float32Array(JSON.parse(row.descriptor));
                const queryDescriptor = detection.descriptor;
                
                const distance = faceapi.euclideanDistance(storedDescriptor, queryDescriptor);
                const threshold = 0.55;
                const match = distance < threshold;
                const similarity = Math.max(0, 100 - (distance * 100));

                if (match) {
                    console.log(`🔓 Acesso PERMITIDO para ${cpf} (Similaridade: ${similarity.toFixed(2)}%)`);
                    res.json({ 
                        success: true, 
                        message: "Acesso Autorizado.", 
                        data: { validated: true, similarity: similarity.toFixed(2) } 
                    });
                } else {
                    console.log(`🔒 Acesso NEGADO para ${cpf} (Similaridade: ${similarity.toFixed(2)}%)`);
                    res.json({ 
                        success: false, 
                        message: "Acesso Negado (Rosto não corresponde).", 
                        data: { validated: false, similarity: similarity.toFixed(2) } 
                    });
                }
            } catch (validationError) {
                console.error("Erro na validação:", validationError);
                res.status(500).json({ success: false, message: "Erro ao processar validação: " + validationError.message });
            }
        });

    } catch (error) {
        console.error("Erro geral na validação:", error);
        res.status(500).json({ success: false, message: "Erro: " + error.message });
    }
});

// 4. Apagar Biometria (DELETE) - COM AUTENTICAÇÃO
app.delete('/api/biometry/:cpf', requireApiKey, (req, res) => {
    const { cpf } = req.params;
    db.run("DELETE FROM pacientes WHERE cpf = ?", [cpf], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        
        if (this.changes === 0) {
            return res.json({ success: false, message: "CPF não encontrado." });
        }
        
        res.json({ success: true, message: "Dados biométricos removidos." });
    });
});

// 5. Backup (POST) - COM AUTENTICAÇÃO
app.post('/api/system/backup', requireApiKey, (req, res) => {
    const backupName = `backup_biometria_${Date.now()}.sqlite`;
    const backupPath = path.join(__dirname, 'backups');
    
    if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath);
    }

    fs.copyFile(dbPath, path.join(backupPath, backupName), (err) => {
        if (err) return res.json({ success: false, message: "Erro no backup: " + err.message });
        res.json({ success: true, message: "Backup criado.", data: { file: backupName } });
    });
});

// === INICIALIZAÇÃO ===
loadModels().then((success) => {
    if (!success) {
        console.error("\n❌ Não foi possível iniciar o servidor. Modelos não carregados.");
        process.exit(1);
    }
    
    // Tenta iniciar o servidor
    const server = app.listen(PORT, () => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`👁️  SISTEMA DE RECONHECIMENTO FACIAL (SOLUS) ONLINE`);
        console.log(`📡 URL: http://localhost:${PORT}`);
        console.log(`🔓 CORS habilitado para Netlify`);
        console.log(`🔐 API Key: ${API_KEY}`);
        console.log(`📂 Modelos: SSD + Landmark68 + Recognition`);
        console.log(`${'='.repeat(60)}\n`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n❌ ERRO: Porta ${PORT} já está em uso!`);
            console.error(`\n🔧 Soluções:`);
            console.error(`   1. Feche o processo que está usando a porta`);
            console.error(`   2. No Windows, execute no CMD como Administrador:`);
            console.error(`      netstat -ano | findstr :${PORT}`);
            console.error(`      taskkill /PID <número_do_PID> /F`);
            console.error(`   3. Ou altere a porta no código (const PORT = 50006;)\n`);
            process.exit(1);
        } else {
            console.error("Erro ao iniciar servidor:", err);
            process.exit(1);
        }
    });
}).catch((err) => {
    console.error("Erro fatal:", err);
    process.exit(1);
});