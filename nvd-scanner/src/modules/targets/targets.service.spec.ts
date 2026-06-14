import { Test, TestingModule } from '@nestjs/testing';
import { TargetsService, AddTargetsResult } from './targets.service';
import { ScanTargetRepository } from './repositories/scan-target.repository';
import { TargetResolverService } from './services/target-resolver.service';
import { NotFoundException } from '@nestjs/common';

const mockScanTargetRepository = {
  findByIps: jest.fn(),
  findByIp: jest.fn(),
  create: jest.fn(),
  saveMany: jest.fn(),
  save: jest.fn(),
};

const mockTargetResolverService = {
  resolveToIpv4: jest.fn(),
};

describe('TargetsService', () => {
  let service: TargetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetsService,
        { provide: ScanTargetRepository, useValue: mockScanTargetRepository },
        { provide: TargetResolverService, useValue: mockTargetResolverService },
      ],
    }).compile();

    service = module.get<TargetsService>(TargetsService);
    jest.clearAllMocks();
  });

  const mockPing = (svc: TargetsService, result: boolean) => {
    (svc as any).pingIp = jest.fn().mockResolvedValue(result);
  };

  it('should add new IPv4 and domain resources', async () => {
    const dto = { resources: ['1.2.3.4', 'example.com'] };
    mockTargetResolverService.resolveToIpv4
      .mockResolvedValueOnce('1.2.3.4') 
      .mockResolvedValueOnce('5.6.7.8'); 
    mockPing(service, true);
    mockScanTargetRepository.findByIps.mockResolvedValue([]);
    mockScanTargetRepository.create.mockImplementation((obj) => ({ ...obj } as any));

    const result: AddTargetsResult = await service.addTargets(dto as any);

    expect(result.added.sort()).toEqual(['1.2.3.4', 'example.com'].sort());
    expect(result.reEnabled).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(mockScanTargetRepository.saveMany).toHaveBeenCalled();
  });

  it('should re‑enable disabled target instead of creating', async () => {
    const dto = { resources: ['test.com'] };
    mockTargetResolverService.resolveToIpv4.mockResolvedValue('9.9.9.9');
    mockPing(service, true);
    const existing = { ip: '9.9.9.9', isEnabled: false } as any;
    mockScanTargetRepository.findByIps.mockResolvedValue([existing]);
    const result = await service.addTargets(dto as any);
    expect(result.added).toEqual([]);
    expect(result.reEnabled).toContain('test.com');
    expect(result.rejected).toEqual([]);
    expect(mockScanTargetRepository.save).toHaveBeenCalledWith(existing);
  });

  it('should reject resources that cannot be resolved', async () => {
    const dto = { resources: ['bad.host'] };
    mockTargetResolverService.resolveToIpv4.mockResolvedValue(null);
    mockScanTargetRepository.findByIps.mockResolvedValue([]);
    mockPing(service, false);
    const result = await service.addTargets(dto as any);
    expect(result.rejected[0].resource).toBe('bad.host');
    expect(result.rejected[0].reason).toBe('Unable to resolve IPv4 or ping failed');
  });

  it('should toggle target state', async () => {
    const dto = { resource: 'toggle.com', enabled: true } as any;
    mockTargetResolverService.resolveToIpv4.mockResolvedValue('1.1.1.1');
    const target = { ip: '1.1.1.1', isEnabled: false } as any;
    mockScanTargetRepository.findByIp = jest.fn().mockResolvedValue(target);
    mockScanTargetRepository.save = jest.fn().mockResolvedValue(undefined);
    const res = await service.toggle(dto);
    expect(res).toEqual({ ip: '1.1.1.1', enabled: true });
     (target.isEnabled).toBe(true);
  });

  it('should throw NotFoundException when toggle resource is not resolvable', async () => {
    const dto = { resource: 'unknown', enabled: true } as any;
    mockTargetResolverService.resolveToIpv4.mockResolvedValue(null);
    await expect(service.toggle(dto)).rejects.toBeInstanceOf(NotFoundException);
  });
});
